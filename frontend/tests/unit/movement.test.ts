import { afterEach, expect, it, vi } from 'vitest';
import rawDemo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import {
  decodeRunRead,
  validateMovementRun,
} from '../../src/contracts/interactive';
import type {
  RuntimeSnapshot,
  ApplicationRuntime,
} from '../../src/app/runtime';
import { createElement } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { MovementDetails } from '../../src/features/movement/MovementPane';
import type {
  InteractiveRun,
  MoveIntent,
  MovementExecution,
  WorldFrame,
} from '../../src/contracts/generated';
import { initialSession } from '../../src/state/sessionStore';
import {
  captureMovement,
  draftReason,
  movementReason,
  reviewMovement,
  translatedEndpoints,
} from '../../src/world/movement';
import { createScene } from '../../src/renderers/scene';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import { derivePresentation } from '../../src/world/presentation';
import { createHistoryCache } from '../../src/world/historyCache';

function state() {
  const frame = structuredClone(rawDemo) as WorldFrame,
    run = frame.interactive!;
  run.state = 'running';
  run.lastReportAt = frame.recordedAt;
  run.lease = {
    holderId: 'Operator',
    revision: 1,
    expiresAt: '2026-09-10T00:00:30.000Z',
  };
  run.controls.slice(0, 2).forEach((c) => {
    c.eligible = true;
    c.reason = 'Eligible.';
  });
  const session = initialSession(frame.mission.id);
  session.selection.items = run.controls
    .slice(0, 2)
    .map((c) => ({ kind: 'entity', id: c.entityId }));
  session.selection.primary = session.selection.items[0];
  return {
    scenario: {
      active: false,
      draft: { name: 'Untitled scenario', units: [] },
      dirty: false,
      busy: false,
      catalog: [],
      reviewing: false,
    },
    catalog: { status: 'ready', missions: [] },
    connection: 'connected',
    missionId: frame.mission.id,
    presentation: {
      status: 'current',
      mode: 'live',
      frame: validateFrame(frame),
    },
    session,
    advancing: false,
    observed: { status: 'idle' },
    browserMode: 'fleet',
    interactive: {
      directPending: [],
      directReceipts: [],
      startingDemo: false,
      busy: false,
      holderId: 'Operator',
      now: frame.recordedAt,
      current: {
        schemaVersion: '1.7',
        serverTime: frame.recordedAt,
        run,
        ownsControl: true,
        leaseState: 'held',
        sequence: frame.sequence,
        frameId: frame.frameId,
      },
    },
  } as RuntimeSnapshot;
}
function reviewed(s = state()) {
  const d = captureMovement(s)!;
  d.longitude = String(Number(d.longitude) + 0.001);
  d.intent = reviewMovement(d);
  d.phase = 'reviewed';
  s.session = { ...s.session, movementDraft: d };
  return { s, d };
}
function execution(s: RuntimeSnapshot): MovementExecution {
  const intent = reviewed(s).d.intent!;
  return {
    ...intent.members[0],
    kind: 'move',
    id: 'execution',
    commandId: 'move',
    missionId: intent.missionId,
    runId: intent.runId,
    executorEpoch: intent.executorEpoch,
    grantRevision: intent.grantRevision,
    reservationRevision: 1,
    state: 'Accepted',
    revision: 1,
    acceptedAt: s.presentation.frame!.recordedAt,
    acceptedSequence: 0,
    deadline: intent.deadline,
    travelledMetres: 0,
    remainingMetres: 111.29,
    speedMps: 43.05555555555556,
  };
}
it('translates centroid offsets in metres with independently supplied WGS84 heights', () => {
  const a = {
    longitudeDeg: 103.85,
    latitudeDeg: 1.29,
    altitude: {
      metres: 120,
      reference: 'ELLIPSOID' as const,
      datumId: 'WGS84' as const,
    },
  };
  const b = {
    ...a,
    longitudeDeg: 103.854,
    latitudeDeg: 1.294,
    altitude: { ...a.altitude, metres: 220 },
  };
  expect(
    translatedEndpoints([a, b], { longitudeDeg: 103.86, latitudeDeg: 1.3 }),
  ).toEqual([
    { ...a, longitudeDeg: 103.858, latitudeDeg: 1.298 },
    { ...b, longitudeDeg: 103.862, latitudeDeg: 1.302 },
  ]);
  expect(() =>
    translatedEndpoints([a, a], { longitudeDeg: 103.86, latitudeDeg: 1.3 }),
  ).toThrow('Coincident');
  expect(() => translatedEndpoints([a], a)).toThrow('one metre');
  expect(() =>
    translatedEndpoints([a, b], { longitudeDeg: 104, latitudeDeg: 1.3 }),
  ).toThrow('extent');
});
it('the one presentation marks a stalled running source stale despite healthy socket, without changing positions', () => {
  const s = state(),
    frame = s.presentation.frame!;
  const presented = derivePresentation(
    { live: frame, connection: 'connected' },
    structuredClone(s.session),
    createHistoryCache(),
    '2026-09-10T00:00:03.000Z',
  );
  expect(presented.status).toBe('stale');
  expect(presented.sourceDelayed).toBe(true);
  expect(presented.frame).toBe(frame);
  (frame.interactive as InteractiveRun).state = 'paused';
  expect(
    derivePresentation(
      { live: frame, connection: 'connected' },
      structuredClone(s.session),
      createHistoryCache(),
      '2026-09-10T01:00:00.000Z',
    ).status,
  ).toBe('current');
});
it('freezes all participants and endpoints across source ticks, browser modes and selection changes', () => {
  const { s, d } = reviewed();
  const wire = JSON.stringify(d.intent);
  s.session = {
    ...s.session,
    selection: {
      ...s.session.selection,
      items: [],
      primary: undefined,
      revision: 10,
    },
  };
  s.browserMode = 'all';
  expect(draftReason(s)).toBeUndefined();
  expect(JSON.stringify(d.intent)).toBe(wire);
  expect(d.participants).toHaveLength(2);
  expect(
    createScene(s.presentation, s.session, undefined, s.interactive)
      .destinations,
  ).toHaveLength(2);
});
it('retains mixed, hidden and missing members with specific reasons and never creates a partial intent', () => {
  const s = state();
  s.session = {
    ...s.session,
    selection: {
      ...s.session.selection,
      items: [
        ...s.session.selection.items,
        { kind: 'entity', id: 'missing' },
        {
          kind: 'entity',
          id: s.presentation.frame!.interactive!.controls[2].entityId,
        },
      ],
    },
  };
  const d = captureMovement(s)!;
  expect(d.participants).toHaveLength(4);
  expect(d.participants[2].reason).toContain('missing');
  expect(d.participants[3].reason).toContain('position');
  expect(() => reviewMovement(d)).toThrow('Every frozen');
  s.session = {
    ...s.session,
    filters: { ...s.session.filters, search: 'O-01' },
  };
  expect(movementReason(s, s.session.selection.items[0].id)).toContain(
    'Hidden',
  );
});
it('shows source stall despite healthy transport, outdated epoch and expired review', () => {
  const { s } = reviewed(),
    id = s.session.selection.items[0].id;
  s.interactive = { ...s.interactive, now: '2026-09-10T00:00:02.001Z' };
  expect(movementReason(s, id)).toContain('Source report delayed');
  s.interactive = { ...s.interactive, now: '2026-09-10T00:00:30.000Z' };
  expect(draftReason(s)).toContain('expired');
  const next = reviewed();
  (next.s.presentation.frame!.interactive as InteractiveRun).executorEpoch =
    'restarted';
  expect(draftReason(next.s)).toContain('Run or grant changed');
});
it('all selected map members are neutral selections while observed-history primary stays singular', () => {
  const s = state(),
    scene = createScene(s.presentation, s.session);
  expect(scene.objects.filter((o) => o.selected)).toHaveLength(2);
  expect(scene.selection.id).toBe(s.session.selection.primary!.id);
  expect(scene.objects.map((o) => o.label)).toContain('O-01');
  expect(scene.objects.map((o) => o.label)).toContain('F-05');
});
it('HTTP acknowledgement cannot replace presented positions or mark an execution as accepted early', () => {
  const { s, d } = reviewed(),
    before = JSON.stringify(s.presentation.frame!.tracks);
  d.phase = 'submitted';
  d.requestId = 'move';
  s.interactive = {
    ...s.interactive,
    movementReceipt: {
      schemaVersion: '1.3',
      requestId: 'move',
      operation: 'move',
      accepted: true,
      code: 'OK',
      message: 'Admitted',
      recordedAt: s.presentation.frame!.recordedAt,
      sequence: 1,
      missionId: s.missionId,
      runId: d.context.runId,
      frameId: 'next',
      recordingId: 'rec',
      executionIds: ['execution'],
    },
  };
  expect(
    createScene(
      s.presentation,
      s.session,
      undefined,
      s.interactive,
    ).destinations?.map((d) => d.stage),
  ).toEqual(['requested', 'requested']);
  expect(JSON.stringify(s.presentation.frame!.tracks)).toBe(before);
});
it('validates profile speed, execution reservations, terminal references and arrival sample evidence at runtime', () => {
  const s = state(),
    frame = s.presentation.frame as WorldFrame,
    run = frame.interactive!;
  const e = execution(s);
  run.controls[0].busyRevision = 1;
  run.executions = [e];
  expect(() => validateFrame(frame)).not.toThrow();
  e.speedMps = 20;
  expect(() => validateFrame(frame)).toThrow('speed differs');
  expect(() => decodeRunRead({ ...s.interactive.current!, run })).toThrow(
    'speed differs',
  );
  run.templateId = 'singapore-local-v1';
  expect(() => validateFrame(frame)).not.toThrow();
  e.speedMps = 43.05555555555556;
  expect(() => validateFrame(frame)).toThrow('speed differs');
  run.templateId = 'singapore-local-v2';
  e.reservationRevision = 2;
  expect(() => validateFrame(frame)).toThrow('reservation');
  e.reservationRevision = 1;
  e.state = 'Completed';
  expect(() => validateMovementRun(run, 0)).toThrow('Terminal');
  e.terminalSequence = 0;
  expect(() => validateMovementRun(run, 0)).toThrow('Completion');
  e.remainingMetres = 0;
  e.completionSample = {
    sequence: 0,
    trackId: e.controlTrackId,
    timestamp: frame.effectiveAt,
    position: e.destination,
  };
  expect(() => validateMovementRun(run, 0)).not.toThrow();
  expect(() => validateFrame(frame)).toThrow('not backed');
  const status = { ...s.interactive.current!, run };
  expect(() => decodeRunRead(status)).not.toThrow();
  e.completionSample.position = e.origin;
  expect(() => decodeRunRead(status)).toThrow('completion sample');
});
it('restores only the initiating perspective when authoring ends, including close/reopen', () => {
  const b = new WorkspaceBridge();
  b.openToSide('three-d');
  const a = {
    center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
    groundSpanM: 1500,
    headingTrueDeg: 35,
    pitchFromNadirDeg: 45,
    projection: 'three-d' as const,
  };
  b.setMapCamera('three-d', 'mid', a);
  const other = { ...a, headingTrueDeg: 100, projection: 'tactical' as const };
  b.setMapCamera('tactical', 'mid', other);
  expect(b.beginDestinationAuthoring('three-d', 'mid').pitchFromNadirDeg).toBe(
    0,
  );
  b.beginDestinationAuthoring('three-d', 'mid');
  b.close('three-d');
  b.open('three-d');
  expect(b.getMapCamera('three-d', 'mid')).toEqual(a);
  expect(b.getMapCamera('tactical', 'mid')).toEqual(other);
  b.dispose();
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});
it('pinned details prefer new active execution and permit fresh cancellation during source delay', () => {
  const s = state(),
    active = execution(s),
    run = s.presentation.frame!.interactive as InteractiveRun;
  run.controls[0].busyRevision = 1;
  run.executions = [
    active,
    { ...active, id: 'older', state: 'Cancelled', terminalSequence: 0 },
  ];
  s.presentation = { ...s.presentation, status: 'stale', sourceDelayed: true };
  const cancelExecution = vi.fn();
  const ui = render(
    createElement(MovementDetails, {
      state: s,
      runtime: { cancelExecution } as unknown as ApplicationRuntime,
      entityId: active.entityId,
    }),
  );
  expect(ui.getByText('Movement · Commanded')).toBeDefined();
  const button = ui.getByRole('button', {
    name: 'Cancel F-01',
    hidden: true,
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(cancelExecution).toHaveBeenCalledWith(active.id);
});
it('persists exact Move before sending and reconciles a lost reply after reload through opaque query lookup', async () => {
  const move = reviewed().d.intent!,
    id = 'opaque /?#% request';
  let body = '';
  const receipt = {
    schemaVersion: '1.6',
    movementOrder: 1,
    requestId: id,
    operation: 'move',
    accepted: true,
    code: 'OK',
    message: 'Admitted',
    recordedAt: '2026-09-10T00:00:00.000Z',
    missionId: move.missionId,
    runId: move.runId,
    recordingId: 'rec',
    frameId: 'next',
    sequence: 1,
    executionIds: ['execution'],
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/moves')) {
      body = init!.body as string;
      expect(
        sessionStorage.getItem('sentinel.interactive.pending.v1'),
      ).toContain(id);
      throw Error('Lost response');
    }
    if (url.includes('/receipts?identity=')) {
      expect(url).toContain(encodeURIComponent(id));
      return Response.json(receipt);
    }
    return Response.json({
      schemaVersion: '1.1',
      enabled: true,
      templateId: 'singapore-local-v2',
    });
  });
  const options = {
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
  };
  const first = createInteractiveClient(options);
  first.setMission(move.missionId);
  await first.submitMove(move, id);
  expect(first.get().error).toContain('Outcome unknown');
  first.dispose();
  const second = createInteractiveClient(options);
  await second.reconcile();
  expect(second.get().pending).toBeUndefined();
  expect(second.get().movementReceipt).toEqual(receipt);
  expect(JSON.parse(body).move).toEqual(move);
  expect(
    fetcher.mock.calls.filter((c) => c[0].endsWith('/moves')),
  ).toHaveLength(1);
  second.dispose();
});
it('explicit Move retry retains payload, identity and original expired deadline', async () => {
  const move = reviewed().d.intent as MoveIntent,
    bodies: string[] = [];
  const client = createInteractiveClient({
    base: '/api',
    storage: sessionStorage,
    publish: () => {},
    loadMission: () => {},
    fetcher: async (url, init) => {
      if (url.endsWith('/moves')) {
        bodies.push(init!.body as string);
        throw Error('Disconnected');
      }
      return Response.json({
        schemaVersion: '1.1',
        enabled: true,
        templateId: 'singapore-local-v2',
      });
    },
  });
  client.setMission(move.missionId);
  await client.submitMove(move, 'same');
  await client.submitMove(move, 'new');
  await client.reconcile(true);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toBe(bodies[1]);
  client.dispose();
});
