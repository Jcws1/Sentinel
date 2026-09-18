import { expect, it } from 'vitest';
import rawDemo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import type {
  DeltaMessage,
  MovePosition,
  WorldFrame,
} from '../../src/contracts/generated';
import { applyDelta } from '../../src/world/reduce';
import { immutableCopy } from '../../src/world/immutable';

function scriptedFrame(): WorldFrame {
  const frame = structuredClone(rawDemo) as WorldFrame;
  const run = frame.interactive!,
    control = run.controls[0];
  const position = frame.tracks[control.controlTrackId!].latest
    .position as MovePosition;
  frame.scenario = {
    definitionId: 'script-definition',
    revision: 1,
    contentHash: 'a'.repeat(64),
    name: 'Contract exercise',
    entityIds: Object.fromEntries(
      Object.keys(frame.entities).map((id) => [id, id]),
    ),
  };
  run.state = 'running';
  frame.scenarioSchedule = {
    ruleVersion: 'local-schedule-v1',
    runId: run.runId,
    sourceId: run.sourceId,
    executorEpoch: run.executorEpoch,
    startConsumed: true,
    manualOverrides: [],
    actions: [
      {
        action: {
          id: 'action',
          unitId: control.entityId,
          kind: 'move',
          offsetMs: 0,
          ordinal: 0,
          destination: {
            longitudeDeg: position.longitudeDeg + 0.001,
            latitudeDeg: position.latitudeDeg,
          },
        },
        entityId: control.entityId,
        trackId: control.controlTrackId!,
        state: 'Accepted',
        revision: 1,
        consumedTick: 0,
        motion: {
          id: 'source-execution',
          acceptedTick: 0,
          acceptedSequence: frame.sequence,
          origin: structuredClone(position),
          destination: {
            ...structuredClone(position),
            longitudeDeg: position.longitudeDeg + 0.001,
          },
          speedMps:
            run.templateId === 'singapore-local-v2' ? 43.05555555555556 : 20,
          travelledMetres: 0,
          remainingMetres: 111.29,
        },
      },
    ],
  };
  return validateFrame(frame);
}

it('reads typed source motion without creating a live grant or operator execution', () => {
  const frame = scriptedFrame();
  expect(frame.interactive!.executions).toHaveLength(0);
  expect(frame.scenarioSchedule!.actions[0].state).toBe('Accepted');
  expect(frame.scenarioSchedule!.actions[0].motion!.origin.altitude).toEqual(
    frame.scenarioSchedule!.actions[0].motion!.destination.altitude,
  );
});

it.each<[string, (frame: WorldFrame) => void]>([
  [
    'wrong source',
    (f) => {
      f.scenarioSchedule!.sourceId = 'other-source';
    },
  ],
  [
    'wrong actor reference',
    (f) => {
      f.scenarioSchedule!.actions[0].action.unitId = 'missing';
    },
  ],
  [
    'future dispatch',
    (f) => {
      f.scenarioSchedule!.actions[0].consumedTick = 20;
    },
  ],
  [
    'future accepted commit',
    (f) => {
      f.scenarioSchedule!.actions[0].motion!.acceptedSequence = f.sequence + 1;
    },
  ],
  [
    'missing arrival evidence',
    (f) => {
      f.scenarioSchedule!.actions[0].state = 'Completed';
    },
  ],
  [
    'overlapping manual ownership',
    (f) => {
      f.scenarioSchedule!.manualOverrides = [
        f.scenarioSchedule!.actions[0].entityId,
      ];
    },
  ],
  [
    'ungranted manual override',
    (f) => {
      f.scenarioSchedule!.manualOverrides = ['hostile'];
    },
  ],
  [
    'changed operational height',
    (f) => {
      f.scenarioSchedule!.actions[0].motion!.destination.altitude.metres += 1;
    },
  ],
  [
    'changed destination',
    (f) => {
      f.scenarioSchedule!.actions[0].motion!.destination.latitudeDeg += 0.001;
    },
  ],
  [
    'changed movement preset',
    (f) => {
      f.scenarioSchedule!.actions[0].motion!.speedMps = 20;
    },
  ],
  [
    'missing Start accounting',
    (f) => {
      f.scenarioSchedule!.startConsumed = false;
    },
  ],
  [
    'duplicate actor starts',
    (f) => {
      const a = structuredClone(f.scenarioSchedule!.actions[0]);
      a.action.id = 'duplicate';
      f.scenarioSchedule!.actions.push(a);
    },
  ],
])('rejects aggregate script corruption: %s', (_name, mutate) => {
  const frame = scriptedFrame();
  mutate(frame);
  expect(() => validateFrame(frame)).toThrow();
});

it('publishes a completed script, position and run tick atomically from a delta', () => {
  const before = immutableCopy(scriptedFrame());
  const mutable = structuredClone(before) as WorldFrame;
  const schedule = mutable.scenarioSchedule!;
  const item = schedule.actions[0],
    motion = item.motion!;
  const timestamp = new Date(
    Date.parse(before.effectiveAt) + 200,
  ).toISOString();
  const nextSequence = before.sequence + 1;
  Object.assign(item, {
    state: 'Completed',
    revision: 2,
    terminalTick: 1,
    terminalSequence: nextSequence,
    reason: 'Arrived',
  });
  Object.assign(motion, {
    startedTick: 1,
    travelledMetres: 111.29,
    remainingMetres: 0,
    completionSample: {
      sequence: nextSequence,
      trackId: item.trackId,
      timestamp,
      position: motion.destination,
    },
  });
  const track = mutable.tracks[item.trackId];
  track.latest = {
    ...track.latest,
    timestamp,
    position: {
      ...structuredClone(motion.destination),
      altitude: { ...motion.destination.altitude, reference: 'ELLIPSOID' },
    },
  };
  const delta: DeltaMessage = {
    schemaVersion: '1.10',
    type: 'delta',
    missionId: before.mission.id,
    recordingId: before.recordingId,
    streamEpoch: before.streamEpoch,
    frameId: 'completed-source-frame',
    sequence: nextSequence,
    previousSequence: before.sequence,
    effectiveAt: timestamp,
    recordedAt: timestamp,
    changes: {
      mission: mutable.mission,
      interactive: { ...mutable.interactive!, tick: 1 },
      scenario: mutable.scenario,
      scenarioSchedule: schedule,
      entities: { upserts: {}, removes: [] },
      tracks: { upserts: { [item.trackId]: track }, removes: [] },
      assets: { upserts: {}, removes: [] },
      sensors: { upserts: {}, removes: [] },
      zones: { upserts: {}, removes: [] },
      tasks: { upserts: {}, removes: [] },
      events: [],
    },
  };
  const partial = structuredClone(delta);
  partial.changes.tracks.upserts = {};
  expect(() => applyDelta(before, partial)).toThrow('Script arrival differs');
  expect(before.scenarioSchedule!.actions[0].state).toBe('Accepted');
  const after = applyDelta(before, delta);
  expect(after.scenarioSchedule!.actions[0].state).toBe('Completed');
  expect(after.tracks[item.trackId].latest.position).toEqual(
    motion.destination,
  );
  expect(Object.isFrozen(after.scenarioSchedule)).toBe(true);
  // Equivalent JSON property order must not invalidate an arrival sample.
  const reordered = structuredClone(delta);
  reordered.changes.tracks.upserts[item.trackId].latest.position = {
    latitudeDeg: motion.destination.latitudeDeg,
    longitudeDeg: motion.destination.longitudeDeg,
    altitude: { ...motion.destination.altitude, reference: 'ELLIPSOID' },
  };
  expect(applyDelta(before, reordered).scenarioSchedule!.actions[0].state).toBe(
    'Completed',
  );
});
