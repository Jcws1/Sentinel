import { insideExtent } from '../world/localGeometry';
import type { WorldFrame } from './generated';
import { invariant } from './integrity';
import { validateActionGraph } from '../world/scriptPlan';
const active = new Set(['Accepted', 'Running']);
const terminal = new Set([
  'Completed',
  'Skipped',
  'Failed',
  'Cancelled',
  'Interrupted',
]);
export function validateSchedule(frame: WorldFrame) {
  const s = frame.scenarioSchedule,
    run = frame.interactive;
  if (!s) return;
  validateActionGraph({
    name: 'Recorded schedule',
    units: [],
    actions: s.actions.map((e) => e.action),
    scheduleRuleVersion: s.ruleVersion,
  });
  invariant(
    run &&
      frame.scenario &&
      s.runId === run.runId &&
      s.sourceId === run.sourceId &&
      s.executorEpoch === run.executorEpoch,
    'Invalid script source context',
  );
  const overrides = s.manualOverrides ?? [],
    controlled = new Set(run!.controls.map((c) => c.entityId));
  invariant(
    new Set(overrides).size === overrides.length &&
      overrides.every((id) => controlled.has(id)),
    'Invalid Manual override authority',
  );
  const ids = new Set<string>(),
    ticks = new Set<string>(),
    running = new Set<string>();
  const manual = new Set(
    (run!.executions ?? [])
      .filter(
        (e) =>
          ![
            'Completed',
            'Cancelled',
            'Failed',
            'Expired',
            'Interrupted',
          ].includes(e.state),
      )
      .map((e) => e.entityId),
  );
  invariant(
    [...manual].every((id) => overrides.includes(id)),
    'Live movement requires Manual override',
  );
  for (const e of s.actions) {
    invariant(
      insideExtent(e.action.destination, frame),
      'Script destination outside frozen extent',
    );
    const a = e.action,
      t = frame.tracks[e.trackId],
      key = `${e.entityId}:${a.offsetMs}`,
      m = e.motion;
    invariant(
      !ids.has(a.id) && (a.offsetMs == null || !ticks.has(key)),
      'Duplicate script identity or actor tick',
    );
    ids.add(a.id);
    if (a.offsetMs != null) ticks.add(key);
    invariant(
      frame.scenario!.entityIds[a.unitId] === e.entityId &&
        frame.entities[e.entityId] &&
        t?.entityId === e.entityId &&
        t.source.id === run!.sourceId &&
        t.source.kind === 'simulation' &&
        t.source.mode === 'simulated',
      'Invalid script actor/Track binding',
    );
    const done = terminal.has(e.state);
    invariant(
      done === (e.terminalSequence != null) &&
        done === (e.terminalTick != null) &&
        (!done || !!e.reason),
      'Script terminal state lacks evidence',
    );
    invariant(
      (e.terminalSequence ?? 0) <= frame.sequence &&
        (e.terminalTick ?? 0) <= run!.tick &&
        (e.consumedTick ?? 0) <= run!.tick,
      'Script references future evidence',
    );
    invariant(
      e.state !== 'Pending' || (!m && e.consumedTick == null),
      'Pending script contains execution',
    );
    invariant(
      (!active.has(e.state) && e.state !== 'Completed') || !!m,
      'Script motion evidence missing',
    );
    invariant(
      s.startConsumed ||
        !['Accepted', 'Running', 'Completed', 'Skipped'].includes(e.state),
      'Script dispatched before Start',
    );
    if (active.has(e.state)) {
      invariant(
        !running.has(e.entityId) &&
          !overrides.includes(e.entityId) &&
          !manual.has(e.entityId),
        'Conflicting source motion ownership',
      );
      running.add(e.entityId);
    }
    if (m) {
      if (a.afterActionId) {
        const previous = s.actions.find((p) => p.action.id === a.afterActionId);
        invariant(
          previous?.state === 'Completed' &&
            m.acceptedTick ===
              previous.terminalTick! + Math.max(1, (a.delayMs ?? 0) / 200),
          'Dependency dispatch lacks committed completion and delay',
        );
      }
      invariant(
        m.acceptedSequence <= frame.sequence &&
          m.acceptedTick === e.consumedTick &&
          m.acceptedTick <= run!.tick &&
          m.speedMps ===
            (frame.unitProfiles?.[e.entityId]?.cruiseMps ??
              (run!.templateId === 'singapore-local-v2' ? 155 / 3.6 : 20)),
        'Invalid script dispatch/profile',
      );
      invariant(
        m.startedTick == null ||
          (m.startedTick >= m.acceptedTick && m.startedTick <= run!.tick),
        'Invalid script start tick',
      );
      invariant(
        e.state !== 'Running' || m.startedTick != null,
        'Running source motion lacks start',
      );
      invariant(
        m.origin.altitude.metres === m.destination.altitude.metres,
        'Script changed supplied height',
      );
      invariant(
        !active.has(e.state) ||
          (m.destination.longitudeDeg === a.destination.longitudeDeg &&
            m.destination.latitudeDeg === a.destination.latitudeDeg),
        'Script destination mismatch',
      );
      invariant(
        (e.state === 'Completed') === !!m.completionSample,
        'Script completion lacks sample',
      );
      const sample = m.completionSample;
      if (sample) {
        invariant(
          m.remainingMetres === 0 &&
            sample.sequence === e.terminalSequence &&
            sample.trackId === e.trackId &&
            sample.position.longitudeDeg === m.destination.longitudeDeg &&
            sample.position.latitudeDeg === m.destination.latitudeDeg &&
            sample.position.altitude.metres === m.destination.altitude.metres,
          'Script arrival evidence disagrees',
        );
        if (sample.sequence === frame.sequence)
          invariant(
            sample.timestamp === t.latest.timestamp &&
              sample.position.longitudeDeg === t.latest.position.longitudeDeg &&
              sample.position.latitudeDeg === t.latest.position.latitudeDeg &&
              sample.position.altitude.metres ===
                t.latest.position.altitude.metres &&
              sample.position.altitude.reference ===
                t.latest.position.altitude.reference &&
              sample.position.altitude.datumId ===
                t.latest.position.altitude.datumId,
            'Script arrival differs from committed sample',
          );
      }
    }
  }
}
