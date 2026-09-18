import { expect, it } from 'vitest';
import legacyArmed from '../fixtures/d4-armed.json';
import legacyOutcome from '../fixtures/d4-outcome.json';
// Match the backend's validated in-memory adaptation; legacy bytes stay intact.
const armed = {
  ...legacyArmed,
  schemaVersion: '1.10',
  interactive: { ...legacyArmed.interactive, schemaVersion: '1.7' },
};
const outcome = {
  ...legacyOutcome,
  schemaVersion: '1.10',
  interactive: { ...legacyOutcome.interactive, schemaVersion: '1.7' },
};
import { validateFrame } from '../../src/contracts/decode';
import { decodeReceipt, decodeRunRead } from '../../src/contracts/interactive';
import { createEngagementCues } from '../../src/world/engagementCues';
import { createScene } from '../../src/renderers/scene';
import { initialSession } from '../../src/state/sessionStore';
import { entityRows } from '../../src/world/entityRows';
import { captureBehavior, behaviorLabel } from '../../src/world/behavior';
import { captureDirectMove } from '../../src/world/directMovement';
import { captureScriptControl } from '../../src/world/scriptControl';
import type { RuntimeSnapshot } from '../../src/app/runtime';

it('keeps unavailable explicit bindings in selected capture while rejecting observations without authority', () => {
  const frame = validateFrame(structuredClone(armed));
  const control = frame.interactive!.controls[0];
  control.capabilities = [];
  frame.assets[control.assetId].availability = 'unavailable';
  const session = initialSession(frame.mission.id);
  session.selection.items = [{ kind: 'entity', id: control.entityId }];
  const state = {
    scenario: { active: false },
    connection: 'connected',
    session,
    presentation: { frame, mode: 'live', status: 'current' },
    interactive: { current: { run: frame.interactive, ownsControl: true } },
  } as unknown as RuntimeSnapshot;
  expect(captureScriptControl(state)).toHaveLength(1);
  expect(captureBehavior(state, 'intercept').members).toHaveLength(1);
  session.selection.items = [
    {
      kind: 'entity',
      id: Object.values(frame.entities).find(
        (e) => e.affiliation === 'hostile',
      )!.id,
    },
  ];
  expect(() => captureScriptControl(state)).toThrow(
    /explicit Sentinel control/,
  );
});

it('reads backend-produced policy and atomic outcomes, retaining identity, height and NON-OP independently of filters', () => {
  validateFrame(armed);
  const f = validateFrame(outcome),
    session = initialSession(f.mission.id);
  const scene = createScene(
    { frame: f, mode: 'live', status: 'current' },
    session,
  );
  expect(scene.objects).toHaveLength(2);
  expect(
    scene.objects.every(
      (o) => o.condition === 'non-operational' && o.unavailable === 'NON-OP',
    ),
  ).toBe(true);
  expect(scene.destinations).toHaveLength(0);
  expect(f.fleetBehavior!.outcomes).toHaveLength(1);
  expect(
    f.fleetBehavior!.outcomes![0].participants.every(
      (p) => p.before.altitude.metres === p.evaluated.altitude.metres,
    ),
  ).toBe(true);
  expect(behaviorLabel(f, scene.objects[0].ref.id)).toBe(
    'NON-OP · simulated loss',
  );
  session.filters.conditions = ['operational'];
  expect(entityRows(f, session.filters).filter((r) => r.visible)).toHaveLength(
    0,
  );
  session.filters.conditions = ['non-operational'];
  expect(entityRows(f, session.filters).filter((r) => r.visible)).toHaveLength(
    2,
  );
});

it('rejects aggregate loss corruption and impossible simultaneous behavior/manual authority', () => {
  const f = validateFrame(structuredClone(outcome));
  const p = f.fleetBehavior!.outcomes![0].participants[0];
  f.entities[p.entityId].condition = 'operational';
  expect(() => validateFrame(f)).toThrow(/persistent loss/);
  const duplicate = validateFrame(structuredClone(outcome));
  duplicate.fleetBehavior!.outcomes!.push({
    ...duplicate.fleetBehavior!.outcomes![0],
    id: 'duplicate',
  });
  expect(() => validateFrame(duplicate)).toThrow(/duplicate outcome/);
  const reservation = validateFrame(structuredClone(armed));
  reservation.fleetBehavior!.members![0].reservationRevision++;
  expect(() => validateFrame(reservation)).toThrow(/binding\/reservation/);
});

it('emits exactly one restrained live cue, freezes on pause, expires in source time, and never replays after reconnect/reopen/replay', () => {
  const f = validateFrame(structuredClone(outcome));
  const o = f.fleetBehavior!.outcomes![0];
  f.sequence = o.committedSequence;
  f.interactive!.tick = o.tick;
  const cues = createEngagementCues();
  const present = () => ({
    frame: f,
    mode: 'live' as const,
    status: 'current' as const,
  });
  expect(cues(present(), true, false)).toEqual([]); // Initial snapshot, even at exact outcome commit.
  f.sequence--;
  f.fleetBehavior!.outcomes = [];
  cues(present(), true, false);
  f.sequence++;
  f.fleetBehavior!.outcomes = [o];
  expect(cues(present(), true, false).map((c) => c.id)).toEqual([o.id]);
  f.interactive!.state = 'paused';
  f.sequence++;
  expect(cues(present(), true, false)).toHaveLength(1);
  expect(cues(present(), true, false)).toHaveLength(1);
  f.interactive!.tick += 3;
  f.sequence++;
  expect(cues(present(), true, false)).toHaveLength(0);
  cues(present(), false, false);
  expect(cues(present(), true, false)).toHaveLength(0);
  expect(cues({ ...present(), mode: 'replay' }, true, false)).toHaveLength(0);
  expect(cues(present(), true, true)).toHaveLength(0);
  expect(cues(present(), true, false)).toHaveLength(0);
});

it.each(['ready', 'running', 'paused', 'ended'] as const)(
  'never emits script previews in %s or recorded context and rejects recorded commands',
  (state) => {
    const f = validateFrame(structuredClone(armed));
    f.interactive!.state = state;
    const c = f.interactive!.controls[0],
      session = initialSession(f.mission.id);
    f.scenarioSchedule = {
      ruleVersion: 'local-schedule-v2',
      runId: f.interactive!.runId,
      sourceId: f.interactive!.sourceId,
      executorEpoch: f.interactive!.executorEpoch,
      startConsumed: state !== 'ready',
      actions: [
        {
          action: {
            id: 'leg',
            unitId: 'author-entity',
            offsetMs: 0,
            ordinal: 0,
            destination: { longitudeDeg: 103.852, latitudeDeg: 1.29 },
          },
          entityId: c.entityId,
          trackId: c.controlTrackId!,
          state: 'Pending',
          revision: 0,
        },
      ],
    };
    for (const mode of ['live', 'replay'] as const) {
      const scene = createScene({ frame: f, mode, status: 'current' }, session);
      expect(scene.destinations).toHaveLength(0);
      expect(scene.objects.length).toBeGreaterThan(0);
    }
    const replay = {
      presentation: { frame: f, mode: 'replay', status: 'current' },
      scenario: { active: false },
    } as unknown as RuntimeSnapshot;
    expect(() => captureDirectMove(replay, 103.85, 1.29)).toThrow(/live demo/);
    expect(() =>
      captureScriptControl({ ...replay, interactive: {} } as RuntimeSnapshot),
    ).toThrow(/connected demo/);
    expect(() =>
      captureBehavior(
        { ...replay, interactive: {} } as RuntimeSnapshot,
        'intercept',
      ),
    ).toThrow(/connected demo/);
  },
);

it('keeps strict archived D3a receipt/status readers and rejects D4 fields in them', () => {
  const current = {
    schemaVersion: '1.5',
    requestId: 'request',
    operation: 'behavior',
    accepted: true,
    code: 'OK',
    message: 'Armed',
    recordedAt: armed.recordedAt,
    missionId: 'mission',
    runId: 'run',
    recordingId: 'recording',
    frameId: 'frame',
    sequence: 2,
    behaviorOrder: 1,
    behaviorOutcomes: [
      {
        assetId: 'asset',
        entityId: 'entity',
        outcome: 'accepted',
        code: 'OK',
        reason: 'Armed',
        state: 'armed',
      },
    ],
  };
  expect(decodeReceipt(current).schemaVersion).toBe('1.5');
  expect(() => decodeReceipt({ ...current, schemaVersion: '1.4' })).toThrow();
  const legacy = structuredClone(armed.interactive);
  const value = {
    schemaVersion: '1.5',
    run: { ...legacy, schemaVersion: '1.5' },
    serverTime: armed.recordedAt,
    frameId: armed.frameId,
    sequence: armed.sequence,
    ownsControl: false,
    leaseState: 'held',
  };
  expect(() => decodeRunRead(value)).toThrow(); // D4 capabilities cannot be laundered through legacy shape.
});
