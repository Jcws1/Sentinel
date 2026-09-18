import { beforeEach, afterEach, expect, it } from 'vitest';
import { createScenarioClient } from '../../src/services/scenarioClient';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import { createLiveBoundaryEditor } from '../../src/services/liveBoundaryEditor';
import {
  scriptPlan,
  positionBefore,
  translatePoint,
} from '../../src/world/scriptPlan';
import { buildActionEdits } from '../../src/world/scriptAuthoring';
import { scenarioScene } from '../../src/world/scenarioDraft';
import { createScene } from '../../src/renderers/scene';
import { initialSession } from '../../src/state/sessionStore';
import {
  decodeScenarioWrite,
  decodeScenarioRevision,
} from '../../src/contracts/scenarios';
import type {
  ScenarioContent,
  BoundaryMutation,
  CommandRequest,
  Receipt,
  WorldFrame,
} from '../../src/contracts/generated';
import type { InteractiveState } from '../../src/services/interactiveClient';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';

const disposals: (() => void)[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => disposals.splice(0).forEach((f) => f()));
function composition(): ScenarioContent {
  return {
    name: 'Four actors',
    units: Array.from({ length: 4 }, (_, i) => ({
      id: `h${i}`,
      label: `Hostile ${i + 1}`,
      category: 'hostile',
      commandRole: 'observation',
      headingTrueDeg: 0,
      position: {
        longitudeDeg: 103.85 + i * 0.0002,
        latitudeDeg: 1.29 + i * 0.0001,
        altitude: {
          metres: 211 + i + 0.125,
          reference: 'ELLIPSOID',
          datumId: 'WGS84',
        },
      },
    })),
  };
}
function chain(delay = 0): ScenarioContent {
  const c = composition(),
    u = c.units[0];
  return {
    ...c,
    scheduleRuleVersion: 'local-schedule-v2',
    actions: [
      {
        id: 'a',
        unitId: u.id,
        offsetMs: 0,
        ordinal: 0,
        destination: translatePoint(u.position, 15, 0),
      },
      {
        id: 'b',
        unitId: u.id,
        afterActionId: 'a',
        delayMs: delay,
        ordinal: 1,
        destination: translatePoint(u.position, 35, 0),
      },
    ].map((a) => ({
      ...a,
      destination: {
        longitudeDeg: a.destination.longitudeDeg,
        latitudeDeg: a.destination.latitudeDeg,
      },
    })),
  };
}
function client() {
  const c = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async () => Response.json({ schemaVersion: '1.3', scenarios: [] }),
  });
  disposals.push(c.dispose);
  c.enter();
  return c;
}
it.each([0, 200, 600])(
  'previews real completion steps and delay %i without connecting interrupted destinations',
  (delay) => {
    const c = chain(delay),
      p = scriptPlan(c);
    expect(p[0].endTick).toBe(2);
    expect(p[1].startTick).toBe(2 + Math.max(1, delay / 200));
    expect(p[1].origin).toEqual(p[0].destination);
    const interrupted = {
      ...c,
      actions: [
        {
          ...c.actions![0],
          destination: { longitudeDeg: 103.86, latitudeDeg: 1.29 },
        },
        {
          id: 'c',
          unitId: 'h0',
          offsetMs: 400,
          ordinal: 1,
          destination: { longitudeDeg: 103.85, latitudeDeg: 1.3 },
        },
      ],
    };
    const legs = scriptPlan(interrupted);
    expect(legs[0].state).toBe('Cancelled');
    expect(legs[1].origin).toEqual(legs[0].reached);
    expect(legs[1].origin).not.toEqual(legs[0].destination);
    const editor = client();
    editor.update(interrupted);
    const scene = scenarioScene(editor.get(), initialSession());
    expect(scene.destinations).toHaveLength(2);
    expect(scene.destinations![0].intentEnd).toEqual(legs[0].reached);
    expect(scene.destinations![0].label).toContain('unreached');
  },
);
it('authors a one-member completion batch and retains its predecessor when edited', () => {
  const content = chain();
  content.actions = content.actions!.slice(0, 1);
  const c = client();
  c.update(content);
  c.beginBatch(['h0']);
  c.editAction({
    timingMode: 'after',
    delaySeconds: '0.4',
    longitude: '103.852',
    latitude: '1.29',
  });
  expect(c.applyAction()).toBe(true);
  const dependent = c.get().draft.actions![1];
  expect(dependent.afterActionId).toBe('a');
  expect(dependent.delayMs).toBe(400);
  c.beginBatch(['h0'], [dependent.id]);
  c.editAction({
    timingMode: 'after',
    delaySeconds: '0.8',
    longitude: '103.853',
  });
  expect(c.applyAction()).toBe(true);
  expect(c.get().draft.actions![1]).toMatchObject({
    id: dependent.id,
    afterActionId: 'a',
    delayMs: 800,
  });
});
it.each(['Pending', 'Skipped'] as const)(
  'keeps draft leg identifiers while excluding %s script previews from run scenes',
  (state) => {
    const content = chain(2200);
    content.actions![1].ordinal = 2;
    content.actions!.splice(1, 0, {
      id: 'later-fixed',
      unitId: 'h0',
      ordinal: 1,
      offsetMs: 60000,
      destination: { longitudeDeg: 103.854, latitudeDeg: 1.29 },
    });
    const plan = scriptPlan(content);
    expect(plan.find((l) => l.action.id === 'b')!.startTick).toBeLessThan(300);
    expect(plan.find((l) => l.action.id === 'b')!.number).toBe(3);
    expect(plan.find((l) => l.action.id === 'later-fixed')!.number).toBe(2);
    const editor = client();
    editor.update(content);
    const draft = scenarioScene(editor.get(), initialSession()).destinations!;
    const frame = structuredClone(demo) as WorldFrame,
      run = frame.interactive!,
      member = run.controls[0];
    frame.scenarioSchedule = {
      ruleVersion: 'local-schedule-v2',
      runId: run.runId,
      sourceId: run.sourceId,
      executorEpoch: run.executorEpoch,
      startConsumed: true,
      manualOverrides: [],
      actions: [...content.actions!].reverse().map((action) => ({
        action,
        entityId: member.entityId,
        trackId: member.controlTrackId!,
        state,
        revision: state === 'Skipped' ? 1 : 0,
        ...(state === 'Skipped'
          ? {
              terminalTick: 0,
              terminalSequence: frame.sequence,
              reason: 'Cancelled predecessor',
            }
          : {}),
      })),
    };
    const before = structuredClone(frame);
    const live = createScene(
      { frame, mode: 'live', status: 'current' },
      initialSession(frame.mission.id),
    );
    expect(
      live.destinations?.some((d) => d.id.startsWith('script:')),
    ).toBeFalsy();
    for (const [id, number] of [
      ['a', 1],
      ['later-fixed', 2],
      ['b', 3],
    ] as const) {
      expect(draft.find((d) => d.id === id)!.label).toMatch(
        new RegExp(`(?:leg |L)${number}`),
      );
    }
    expect(frame).toEqual(before);
  },
);
it('preserves later-leg formation offsets and independent batch edits', () => {
  const c = composition();
  c.actions = c.units.map((u, i) => ({
    id: `a${i}`,
    unitId: u.id,
    ordinal: i,
    offsetMs: 0,
    destination: {
      longitudeDeg: u.position.longitudeDeg + (i + 1) * 0.001,
      latitudeDeg: u.position.latitudeDeg,
    },
  }));
  c.scheduleRuleVersion = 'local-schedule-v1';
  const editor = client();
  editor.update(c);
  editor.beginBatch(c.units.map((u) => u.id));
  editor.editAction({ seconds: '30', longitude: '103.86', latitude: '1.30' });
  expect(editor.applyAction()).toBe(true);
  const batch = editor.get().draft.actions!.slice(4),
    bases = c.units.map((u) => positionBefore(c, u.id, 150));
  expect(batch).toHaveLength(4);
  expect(
    batch[1].destination.longitudeDeg - batch[0].destination.longitudeDeg,
  ).toBeCloseTo(bases[1].longitudeDeg - bases[0].longitudeDeg, 8);
  editor.beginBatch(
    c.units.map((u) => u.id),
    batch.map((a) => a.id),
  );
  const old = buildActionEdits(editor.get().draft, editor.get().actionEdit!);
  editor.editAction({ longitude: '103.861' });
  expect(editor.applyAction()).toBe(true);
  const changed = editor.get().draft.actions!.slice(4);
  expect(
    changed[1].destination.longitudeDeg - changed[0].destination.longitudeDeg,
  ).toBeCloseTo(
    old[1].destination.longitudeDeg - old[0].destination.longitudeDeg,
    8,
  );
  editor.beginAction(changed[0].id);
  editor.editAction({ longitude: '103.862' });
  expect(editor.applyAction()).toBe(true);
  expect(
    editor.get().draft.actions!.find((a) => a.id === changed[1].id),
  ).toEqual(changed[1]);
});
it('rejects a complete conflicting group and recovers the unchanged batch editor after reload', () => {
  const c = composition();
  c.actions = [
    {
      id: 'existing',
      unitId: 'h0',
      offsetMs: 0,
      ordinal: 0,
      destination: { longitudeDeg: 103.86, latitudeDeg: 1.3 },
    },
  ];
  c.scheduleRuleVersion = 'local-schedule-v1';
  const editor = client();
  editor.update(c);
  editor.beginBatch(c.units.map((u) => u.id));
  editor.editAction({ longitude: '103.87', latitude: '1.30' });
  editor.armAction('three-d');
  expect(editor.applyAction()).toBe(false);
  expect(editor.get().draft).toEqual(c);
  const ids = editor.get().actionEdit!.batch!.map((m) => m.id);
  editor.dispose();
  const reload = client();
  expect(reload.get().actionEdit?.batch?.map((m) => m.id)).toEqual(ids);
  expect(reload.get().actionEdit?.viewId).toBeUndefined();
  expect(reload.get().draft).toEqual(c);
});
it('keeps dependency references strict and prevents silently deleting predecessors', () => {
  const c = chain();
  const editor = client();
  editor.update(c);
  editor.deleteAction('a');
  expect(editor.get().draft.actions).toHaveLength(2);
  expect(editor.get().error).toContain('depend');
  expect(() =>
    decodeScenarioWrite({
      requestId: 'x',
      expectedRevision: 0,
      content: {
        ...c,
        actions: [...c.actions!, { ...c.actions![1], id: 'branch' }],
      },
    }),
  ).toThrow();
  expect(() =>
    decodeScenarioRevision({
      schemaVersion: '1.2',
      definitionId: 'old',
      revision: 1,
      contentHash: 'a'.repeat(64),
      createdAt: '2026-09-18T00:00:00.000Z',
      content: c,
    }),
  ).toThrow();
});
it('remaps predecessor IDs once for a copied definition even when Save loses its response', async () => {
  const bodies: unknown[] = [];
  const c = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (_, init) => {
      if (init?.method === 'POST') {
        bodies.push(JSON.parse(String(init.body)));
        throw Error('lost');
      }
      return Response.json({ schemaVersion: '1.3', scenarios: [] });
    },
  });
  disposals.push(c.dispose);
  c.enter();
  const original = chain();
  c.update(original);
  await c.save(true);
  const request = c.get().pending!.body,
    actions = request.content.actions!;
  expect(actions[1].afterActionId).toBe(actions[0].id);
  expect(actions[0].id).not.toBe('a');
  expect(actions[0].unitId).not.toBe('h0');
  await c.reconcile(true);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(c.get().draft).toEqual(original);
});
it('matches a saved batch receipt after JSON omits undefined optional fields', async () => {
  const c = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (_, init) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return Response.json({
          schemaVersion: '1.2',
          requestId: body.requestId,
          accepted: true,
          code: 'OK',
          message: 'Saved',
          result: {
            schemaVersion: '1.2',
            definitionId: 'saved-batch',
            revision: 1,
            contentHash: 'a'.repeat(64),
            createdAt: '2026-09-18T00:00:00.000Z',
            content: body.content,
          },
        });
      }
      return Response.json({ schemaVersion: '1.3', scenarios: [] });
    },
  });
  disposals.push(c.dispose);
  c.enter();
  const data = composition();
  c.update(data);
  c.beginBatch(data.units.map((u) => u.id));
  c.editAction({ longitude: '103.852', latitude: '1.29' });
  expect(c.applyAction()).toBe(true);
  await c.save();
  expect(c.get().error).toBeUndefined();
  expect(c.get().pending).toBeUndefined();
  expect(c.get().saved?.revision).toBe(1);
  expect(c.get().dirty).toBe(false);
});
it('propagates an interrupted predecessor in the same preview tick and honours the remaining run horizon', () => {
  const c = chain();
  c.actions![0].destination = { longitudeDeg: 103.86, latitudeDeg: 1.29 };
  c.actions!.push({
    id: 'replacement',
    unitId: 'h0',
    offsetMs: 400,
    ordinal: 2,
    destination: { longitudeDeg: 103.852, latitudeDeg: 1.29 },
  });
  const p = scriptPlan(c);
  expect(p[0].state).toBe('Cancelled');
  expect(p[1].state).toBe('Skipped');
  expect(p[1].endTick).toBe(p[0].endTick);
  const short = scriptPlan(chain(600), 3);
  expect(short[1].state).toBe('Skipped');
  expect(short[1].startTick).toBeUndefined();
});
it('retains manual override accounting without emitting script preview geometry', () => {
  const frame = structuredClone(demo) as WorldFrame;
  const run = frame.interactive!,
    member = run.controls[0];
  const action = {
    id: 'future-action',
    unitId: 'draft-actor',
    offsetMs: 10000,
    ordinal: 0,
    destination: { longitudeDeg: 103.853, latitudeDeg: 1.29 },
  };
  frame.scenarioSchedule = {
    ruleVersion: 'local-schedule-v2',
    runId: run.runId,
    sourceId: run.sourceId,
    executorEpoch: run.executorEpoch,
    startConsumed: true,
    manualOverrides: [member.entityId],
    actions: [
      {
        action,
        entityId: member.entityId,
        trackId: member.controlTrackId!,
        state: 'Pending',
        revision: 0,
      },
    ],
  };
  const before = structuredClone(frame);
  const live = () =>
    createScene(
      { frame, mode: 'live', status: 'current' },
      initialSession(frame.mission.id),
    );
  expect(live().destinations).toEqual([]);
  expect(frame).toEqual(before);
  frame.scenarioSchedule!.manualOverrides = [];
  expect(live().destinations).toEqual([]);
});
it('journals one leased boundary command with exact geometry and reconciles a lost response', async () => {
  const mutation: BoundaryMutation = {
    expectedRevision: 3,
    operation: 'upsert',
    boundaryId: 'run:boundary:b',
    definition: {
      id: 'b',
      name: 'Live rule',
      type: 'annotation',
      vertices: [
        [103.85, 1.29],
        [103.851, 1.29],
        [103.85, 1.291],
      ],
    },
  };
  const sent: CommandRequest[] = [];
  let receipt: Receipt | undefined;
  const c = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    fetcher: async (url, init) => {
      if (String(url).endsWith('/intents'))
        return Response.json({
          id: 'intent',
          missionId: 'mission',
          runId: 'run',
          sourceId: 'source',
          grantId: 'grant',
          runRevision: 1,
          grantRevision: 1,
          leaseRevision: 1,
          executorEpoch: 'epoch',
          issuedAt: '2026-09-18T00:00:00.000Z',
          expiresAt: '2026-09-18T00:00:30.000Z',
          ...JSON.parse(String(init?.body)),
        });
      if (String(url).endsWith('/commands')) {
        const body = JSON.parse(String(init?.body)) as CommandRequest;
        sent.push(body);
        receipt = {
          schemaVersion: '1.6',
          requestId: body.commandId,
          operation: 'boundary-edit',
          accepted: true,
          code: 'OK',
          message: 'Committed',
          recordedAt: '2026-09-18T00:00:01.000Z',
          missionId: 'mission',
          runId: 'run',
          recordingId: 'recording',
          sequence: 10,
          frameId: 'frame',
          boundaryRevision: 4,
        };
        throw Error('lost');
      }
      if (String(url).includes('/receipts?')) return Response.json(receipt);
      return Response.json({
        schemaVersion: '1.1',
        enabled: true,
        templateId: 'singapore-local-v2',
      });
    },
  });
  disposals.push(c.dispose);
  c.setMission('mission');
  await c.perform('boundary-edit', undefined, undefined, undefined, mutation);
  expect(c.get().pending).toBeDefined();
  expect(sent[0].intent.boundary).toEqual(mutation);
  await c.reconcile();
  expect(c.get().pending).toBeUndefined();
  expect(sent).toHaveLength(1);
  expect(c.get().receipt?.accepted).toBe(true);
});
it('keeps live geometry provisional and pins conflict revision across continued simulation updates', async () => {
  const frame = structuredClone(demo) as WorldFrame,
    run = frame.interactive!;
  run.capabilities.push('boundary-edit');
  const commands: BoundaryMutation[] = [];
  const editor = createLiveBoundaryEditor({
    publish: () => {},
    submit: async (m) => {
      commands.push(m);
    },
  });
  const status: InteractiveState = {
    busy: false,
    startingDemo: false,
    holderId: 'operator',
    directPending: [],
    directReceipts: [],
    current: {
      schemaVersion: '1.7',
      run,
      frameId: frame.frameId,
      sequence: frame.sequence,
      serverTime: frame.recordedAt,
      ownsControl: true,
      leaseState: 'held',
    },
  };
  editor.sync(frame, status);
  editor.beginBoundary('tactical');
  editor.boundaryPoint(103.85, 1.29);
  editor.boundaryPoint(103.851, 1.29);
  editor.boundaryPoint(103.85, 1.291);
  expect(editor.applyBoundary()).toBe(true);
  expect(commands).toHaveLength(0);
  expect(editor.get().provisional).toHaveLength(1);
  const b = editor.get().provisional[0];
  frame.liveBoundaries = {
    ruleVersion: 'local-boundary-v1',
    runId: run.runId,
    sourceId: run.sourceId,
    revision: 1,
    lastCommandId: 'another-editor',
    committedSequence: frame.sequence,
  };
  editor.sync(frame, status);
  editor.setBoundaryType(b.id, 'restricted');
  await Promise.resolve();
  expect(commands[0].expectedRevision).toBe(0);
  expect(commands[0].boundaryId).toBe(`${run.runId}:boundary:${b.id}`);
  expect(frame.zones[commands[0].boundaryId]).toBeUndefined();
});
