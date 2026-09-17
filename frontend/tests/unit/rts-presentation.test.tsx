import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import raw from '../../../contracts/sentinel/v1.4/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import type {
  ApplicationRuntime,
  RuntimeSnapshot,
} from '../../src/app/runtime';
import type {
  MovementExecution,
  MovePosition,
  Receipt,
  WorldFrame,
} from '../../src/contracts/generated';
import { initialSession } from '../../src/state/sessionStore';
import { formatSgt } from '../../src/world/time';
import { captureDirectMove } from '../../src/world/directMovement';
import {
  assetStatus,
  directStatusText,
  sourceChoices,
} from '../../src/features/entities/presentation';
import { OperationalChrome } from '../../src/features/entities/OperationalChrome';
import { missionDisplayName } from '../../src/features/mission/MissionControls';
import { SimulationControls } from '../../src/features/entities/SimulationControls';
import {
  MovementPane,
  MovementToolbar,
  armMoveInMap,
  executionLabel,
} from '../../src/features/movement/MovementPane';
import { OperationalContext } from '../../src/app/OperationalContext';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function snapshot() {
  const frame = structuredClone(validateFrame(raw)) as WorldFrame;
  const run = frame.interactive!;
  run.state = 'running';
  run.lastReportAt = frame.recordedAt;
  run.lease = {
    revision: 1,
    holderId: 'Local operator',
    expiresAt: new Date(Date.parse(frame.recordedAt) + 60_000).toISOString(),
  };
  const session = initialSession(frame.mission.id);
  session.selection.items = [{ kind: 'entity', id: run.controls[0].entityId }];
  session.selection.primary = session.selection.items[0];
  return {
    missionId: frame.mission.id,
    presentation: { status: 'current', mode: 'live', frame },
    session,
    connection: 'connected',
    observed: { status: 'idle' },
    interactive: {
      busy: false,
      startingDemo: false,
      directPending: [],
      directReceipts: [],
      holderId: 'Local operator',
      now: frame.recordedAt,
      entry: { enabled: true, activeMissionId: frame.mission.id },
      current: {
        schemaVersion: '1.3',
        run,
        ownsControl: true,
        leaseState: 'held',
        serverTime: frame.recordedAt,
        frameId: frame.frameId,
        sequence: frame.sequence,
      },
    },
    catalog: { status: 'ready', missions: [frame.mission] },
    advancing: false,
    browserMode: 'all',
  } as RuntimeSnapshot;
}

it('uses one 24-hour Singapore clock with midnight/date rollover without changing the input instant', () => {
  const utc = '2026-09-15T16:05:36.086Z';
  expect(formatSgt(utc)).toBe('00:05:36 SGT');
  expect(formatSgt(utc, { date: true })).toBe('16 Sep 2026 · 00:05:36 SGT');
  expect(formatSgt('2026-09-15T15:59:59.999Z', { date: true })).toBe(
    '15 Sep 2026 · 23:59:59 SGT',
  );
  expect(formatSgt(new Date(utc), { date: true })).toBe(
    formatSgt(utc, { date: true }),
  );
  expect(formatSgt('invalid')).toBe('Unavailable');
  expect(formatSgt(null)).toBe('Unavailable');
  expect(utc).toBe('2026-09-15T16:05:36.086Z');
});

it('uses concise display aliases without changing fixture IDs or inventing demo numbers', () => {
  const fixture = { id: 'fixture-alpha', name: 'Synthetic Alpha' };
  expect(missionDisplayName(fixture)).toBe('Alpha');
  expect(fixture).toEqual({ id: 'fixture-alpha', name: 'Synthetic Alpha' });
  expect(missionDisplayName({ id: 'opaque-id', name: 'Demo 042' })).toBe(
    'Demo 042',
  );
});

it('distinguishes no response and absent position from confirmed non-operational status', () => {
  const state = snapshot(),
    frame = structuredClone(state.presentation.frame!) as WorldFrame;
  const id = (label: string) =>
    Object.values(frame.entities).find((e) => e.label === label)!.id;
  expect(assetStatus(frame, id('F-03'))).toBe('No position');
  expect(assetStatus(frame, id('F-04'))).toBe('No response');
  frame.entities[id('F-04')].condition = 'non-operational';
  expect(assetStatus(frame, id('F-04'))).toBe('Down');
  expect(assetStatus(frame, id('O-01'))).toBe('Unmanaged');
  expect(
    executionLabel({ state: 'Cancelled', reason: 'Superseded by order 7.' }),
  ).toBe('Superseded');
});

it('New demo is one operator action and the running demo has one contextual pause action', () => {
  const state = snapshot(),
    runtime = {
      newDemo: vi.fn(),
      interactiveAction: vi.fn(),
    } as unknown as ApplicationRuntime;
  const empty = {
    ...state,
    missionId: undefined,
    presentation: { ...state.presentation, frame: undefined },
    interactive: {
      ...state.interactive,
      current: undefined,
      entry: { ...state.interactive.entry!, activeMissionId: null },
    },
  };
  const { rerender } = render(
    <SimulationControls state={empty} runtime={runtime} compact />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'New demo' }));
  expect(runtime.newDemo).toHaveBeenCalledOnce();
  expect(runtime.interactiveAction).not.toHaveBeenCalled();
  rerender(<SimulationControls state={state} runtime={runtime} compact />);
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
  expect(runtime.interactiveAction).toHaveBeenCalledWith('pause');
  expect(screen.queryByText('Acquire control')).toBeNull();
});

it('Move arms the existing 3D map without opening Activity and stays available while direct receipts are pending', () => {
  const state = snapshot(),
    bridge = new WorkspaceBridge({ initialViews: ['three-d'] });
  const runtime = { armDirectMove: vi.fn() } as unknown as ApplicationRuntime;
  state.interactive = {
    ...state.interactive,
    directPending: [
      {
        missionId: state.missionId!,
        body: {
          commandId: 'earlier-request',
          holderId: 'Local operator',
          direct: { ...captureDirectMove(state, 103.851, 1.291), order: 1 },
        },
      },
    ],
  };
  render(<MovementToolbar state={state} runtime={runtime} bridge={bridge} />);
  const button = screen.getByRole('button', { name: 'Move' });
  expect((button as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(button);
  expect(runtime.armDirectMove).toHaveBeenCalledWith('three-d');
  expect(bridge.getSnapshot().views.map((v) => v.id)).not.toContain('movement');
  bridge.revealDetails();
  armMoveInMap(runtime, bridge);
  expect(runtime.armDirectMove).toHaveBeenLastCalledWith('three-d');
  bridge.dispose();
});

it('Activity preserves per-member skipped outcomes and keeps receipt acceptance separate from committed movement', () => {
  const state = snapshot(),
    frame = state.presentation.frame!,
    controls = frame.interactive!.controls;
  const receipt: Receipt = {
    schemaVersion: '1.2',
    requestId: 'request-current',
    operation: 'direct-move',
    missionId: frame.mission.id,
    recordedAt: frame.recordedAt,
    sequence: frame.sequence + 1,
    accepted: true,
    code: 'OK',
    message: 'One commanded, one skipped',
    directOrder: 2,
    memberOutcomes: [
      {
        assetId: controls[0].assetId,
        entityId: controls[0].entityId,
        outcome: 'accepted',
        code: 'OK',
        reason: 'Accepted',
        executionId: 'execution-1',
      },
      {
        assetId: controls[3].assetId,
        entityId: controls[3].entityId,
        outcome: 'skipped',
        code: 'NO_RESPONSE',
        reason: 'No response',
      },
    ],
  };
  state.interactive = {
    ...state.interactive,
    directReceipts: [receipt],
    directReceipt: receipt,
  };
  const runtime = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    directMove: vi.fn(),
  } as unknown as ApplicationRuntime;
  const bridge = new WorkspaceBridge();
  render(
    <OperationalContext.Provider value={runtime}>
      <MovementPane bridge={bridge} />
    </OperationalContext.Provider>,
  );
  expect(screen.getByText('1 commanded · 1 skipped')).toBeTruthy();
  fireEvent.click(screen.getByText('1 commanded · 1 skipped'));
  expect(
    screen.getByText('Received, awaiting world synchronization.'),
  ).toBeTruthy();
  expect(screen.getByText(/Skipped · No response/)).toBeTruthy();
  expect(screen.queryByText('Moving', { exact: true })).toBeNull();
  expect(state.presentation.frame).toBe(frame);
  fireEvent.click(screen.getByText('Move by coordinates', { exact: true }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Destination longitude' }),
    { target: { value: '0' } },
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Destination latitude' }),
    { target: { value: '1.29' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Move selected' }));
  expect(runtime.directMove).toHaveBeenCalledWith(0, 1.29);
  bridge.dispose();
});

it('replaces receipt acknowledgement with only the newest command’s committed movement status, preserving skipped outcomes', () => {
  const state = snapshot(),
    frame = structuredClone(state.presentation.frame!) as WorldFrame,
    run = frame.interactive!;
  state.presentation = { ...state.presentation, frame };
  const receipt: Receipt = {
    schemaVersion: '1.2',
    requestId: 'latest-command',
    operation: 'direct-move',
    missionId: frame.mission.id,
    recordedAt: frame.recordedAt,
    sequence: frame.sequence + 1,
    accepted: true,
    code: 'OK',
    message: '2 commanded · 1 skipped',
    directOrder: 7,
    memberOutcomes: [0, 1, 3].map((index) => ({
      assetId: run.controls[index].assetId,
      entityId: run.controls[index].entityId,
      outcome: index === 3 ? 'skipped' : 'accepted',
      code: index === 3 ? 'NO_RESPONSE' : 'OK',
      reason: index === 3 ? 'No response' : 'Accepted',
      executionId: index === 3 ? undefined : `execution-${index}`,
    })),
  };
  const original = JSON.stringify(receipt);
  state.interactive = {
    ...state.interactive,
    directReceipt: receipt,
    directReceipts: [receipt],
    directFeedback: {
      id: receipt.requestId,
      stage: 'accepted',
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      acknowledgedAt: Date.now(),
      message: receipt.message,
    },
  };
  const runtime = {
      getSnapshot: () => state,
      subscribe: () => () => {},
    } as unknown as ApplicationRuntime,
    bridge = new WorkspaceBridge();
  const view = () => (
    <OperationalContext.Provider value={runtime}>
      <OperationalChrome bridge={bridge} />
    </OperationalContext.Provider>
  );
  const { rerender } = render(view());
  expect(screen.getByText('2 commanded · 1 skipped')).toBeTruthy();
  expect(
    screen.getByText('Received, awaiting world synchronization.'),
  ).toBeTruthy();
  frame.sequence = receipt.sequence!;
  run.executions = [0, 1].map((index): MovementExecution => {
    const binding = run.controls[index],
      position = structuredClone(
        frame.tracks[binding.controlTrackId!].latest.position,
      ) as MovePosition;
    return {
      id: `execution-${index}`,
      entityId: binding.entityId,
      assetId: binding.assetId,
      missionId: frame.mission.id,
      runId: run.runId,
      commandId: receipt.requestId,
      executorId: binding.executorId,
      executorEpoch: run.executorEpoch,
      sourceId: binding.sourceId,
      controlTrackId: binding.controlTrackId!,
      grantId: binding.grantId,
      grantRevision: run.grantRevision,
      bindingRevision: binding.bindingRevision,
      busyRevision: 0,
      reservationRevision: 1,
      revision: 1,
      state: 'Running',
      acceptedAt: frame.recordedAt,
      acceptedSequence: frame.sequence,
      startedAt: frame.effectiveAt,
      deadline: frame.recordedAt,
      origin: position,
      destination: position,
      travelledMetres: 4,
      remainingMetres: 100,
      directOrder: 7,
    };
  });
  rerender(view());
  expect(screen.getByText('2 moving · 1 skipped')).toBeTruthy();
  expect(screen.queryByText('2 commanded · 1 skipped')).toBeNull();
  run.executions[0].state = 'Suspended';
  expect(directStatusText(state)).toBe('1 paused · 1 moving · 1 skipped');
  for (const execution of run.executions) {
    execution.state = 'Completed';
    execution.completionSample = {
      sequence: frame.sequence,
      position: execution.destination,
      timestamp: frame.effectiveAt,
      trackId: execution.controlTrackId,
    };
  }
  rerender(view());
  expect(screen.getByText('2 completed · 1 skipped')).toBeTruthy();
  expect(JSON.stringify(receipt)).toBe(original);
  state.connection = 'disconnected';
  expect(directStatusText(state)).toBe(
    'Last reported · 2 completed · 1 skipped',
  );
  state.connection = 'connected';
  run.executions[0].completionSample = undefined;
  expect(directStatusText(state)).toBe(
    '1 completion unverified · 1 completed · 1 skipped',
  );
  run.executions[0].state = 'Cancelled';
  run.executions[0].reason = 'Superseded by order 8.';
  expect(directStatusText(state)).toBe(
    '1 superseded · 1 completed · 1 skipped',
  );
  run.executions[1].commandId = 'another-command';
  expect(directStatusText(state)).toBe(
    '1 superseded · 1 state unavailable · 1 skipped',
  );
  state.interactive = {
    ...state.interactive,
    directFeedback: {
      ...state.interactive.directFeedback!,
      id: 'newer-pending-command',
      stage: 'pending',
      message: 'Destination requested',
    },
  };
  expect(directStatusText(state)).toBe('Destination requested');
  state.interactive = {
    ...state.interactive,
    directFeedback: {
      ...state.interactive.directFeedback!,
      stage: 'rejected',
      message: 'Destination outside the supported area',
    },
  };
  expect(directStatusText(state)).toBe(
    'Destination outside the supported area',
  );
  bridge.dispose();
});

it('source filters use readable distinct labels while retaining exact source identities', () => {
  const state = snapshot(),
    frame = structuredClone(state.presentation.frame!) as WorldFrame;
  const track = Object.values(frame.tracks).find(
    (value) => value.source.id === frame.interactive!.sourceId,
  )!;
  frame.tracks['other-observation'] = {
    ...structuredClone(track),
    id: 'other-observation',
    source: { ...track.source, id: 'another-opaque-source' },
  };
  frame.tracks['third-observation'] = {
    ...structuredClone(track),
    id: 'third-observation',
    source: { ...track.source, id: 'third-opaque-source' },
  };
  const choices = sourceChoices(frame);
  expect(choices).toContainEqual({
    id: frame.interactive!.sourceId,
    label: 'Local simulator',
  });
  expect(choices).toContainEqual({
    id: 'demo-observer-v1',
    label: 'Demo observer',
  });
  expect(
    choices.find((item) => item.id === 'another-opaque-source')?.label,
  ).toBe('Simulation · simulated 1');
  expect(choices.find((item) => item.id === 'third-opaque-source')?.label).toBe(
    'Simulation · simulated 2',
  );
  expect(choices.every((item) => item.label !== item.id)).toBe(true);
  expect(new Set(choices.map((item) => item.id)).size).toBe(choices.length);
});
