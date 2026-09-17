import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import raw from '../../../contracts/sentinel/v1.7/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import type {
  ApplicationRuntime,
  RuntimeSnapshot,
} from '../../src/app/runtime';
import { OperationalContext } from '../../src/app/OperationalContext';
import { EntityDetails } from '../../src/features/entities/EntityDetails';
import { CopyValue } from '../../src/features/entities/CopyValue';
import { OperationalChrome } from '../../src/features/entities/OperationalChrome';
import type { Receipt, RunRead } from '../../src/contracts/generated';
import {
  managedRows,
  availability,
  controlLabel,
} from '../../src/features/entities/presentation';
import { selectForDetails } from '../../src/features/entities/selectionActions';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps synchronization notices for either receipt without replacing the presented world', () => {
  const state = snapshot(),
    frame = state.presentation.frame!,
    bridge = new WorkspaceBridge();
  const receipt = (sequence: number): Receipt => ({
    schemaVersion: '1.2',
    accepted: true,
    code: 'OK',
    message: 'Accepted',
    missionId: frame.mission.id,
    requestId: `receipt-${sequence}`,
    recordedAt: frame.recordedAt,
    operation: 'pause',
    sequence,
  });
  state.interactive = {
    ...state.interactive,
    movementReceipt: {
      ...receipt(frame.sequence),
      operation: 'move',
    },
  };
  state.interactive = {
    ...state.interactive,
    receipt: receipt(frame.sequence + 1),
  };
  const runtime = {
    getSnapshot: () => state,
    subscribe: () => () => {},
  } as unknown as ApplicationRuntime;
  const view = () => (
    <OperationalContext.Provider value={runtime}>
      <OperationalChrome bridge={bridge} />
    </OperationalContext.Provider>
  );
  const { rerender } = render(view());
  expect(
    screen.getByText('Received, awaiting world synchronization.'),
  ).toBeTruthy();
  expect(state.presentation.frame).toBe(frame);
  state.interactive = {
    ...state.interactive,
    receipt: {
      ...receipt(frame.sequence + 2),
      missionId: 'another-mission',
    },
  };
  rerender(view());
  expect(
    screen.queryByText('Received, awaiting world synchronization.'),
  ).toBeNull();
  state.interactive = {
    ...state.interactive,
    movementReceipt: {
      ...receipt(frame.sequence + 3),
      operation: 'move',
    },
  };
  rerender(view());
  expect(
    screen.getByText('Received, awaiting world synchronization.'),
  ).toBeTruthy();
  bridge.dispose();
});

it('does not claim control from an expired, disconnected or unsynchronized status read', () => {
  const state = snapshot(),
    frame = state.presentation.frame!;
  const run = structuredClone(frame.interactive!) as RunRead['run'];
  run.lease = {
    holderId: 'Operator',
    revision: 1,
    expiresAt: '2026-09-15T12:00:30.000Z',
  };
  state.presentation.frame = { ...frame, interactive: run };
  state.interactive = { ...state.interactive, now: '2026-09-15T12:00:00.000Z' };
  state.interactive = {
    ...state.interactive,
    current: {
      schemaVersion: '1.3',
      serverTime: state.interactive.now!,
      ownsControl: true,
      leaseState: 'held',
      run,
      frameId: frame.frameId,
      sequence: frame.sequence,
    },
  };
  expect(controlLabel(state)).toBe('Control held by this session');
  state.interactive = { ...state.interactive, now: run.lease.expiresAt! };
  expect(controlLabel(state)).toContain('Control expired');
  state.connection = 'disconnected';
  expect(controlLabel(state)).toBe('Control status unverified');
  state.connection = 'connected';
  state.interactive = {
    ...state.interactive,
    current: {
      ...state.interactive.current!,
      run: { ...run, runRevision: run.runRevision + 1 },
    },
  };
  expect(controlLabel(state)).toBe('Waiting for synchronized control status');
});
function snapshot() {
  const frame = validateFrame(structuredClone(raw)),
    session = initialSession(frame.mission.id);
  session.selection.items = frame
    .interactive!.controls.slice(0, 2)
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
    presentation: { status: 'current', mode: 'live', frame },
    session,
    connection: 'connected',
    observed: { status: 'idle' },
    interactive: {
      directPending: [],
      directReceipts: [],
      startingDemo: false,
      busy: false,
      holderId: 'Operator',
    },
    catalog: { status: 'idle', missions: [] },
    advancing: false,
    browserMode: 'all',
  } as RuntimeSnapshot;
}
it('lists managed identities once, retaining filtered and unavailable members without changing filters', () => {
  const state = snapshot();
  state.session = {
    ...state.session,
    filters: { ...state.session.filters, search: 'no match' },
  };
  const rows = managedRows(state);
  expect(rows).toHaveLength(4);
  expect(rows.every((r) => !r.visible)).toBe(true);
  expect(new Set(rows.map((r) => r.entity.id)).size).toBe(4);
  expect(
    rows.filter(
      (r) =>
        availability(state.presentation.frame!, r.entity.id) === 'Unavailable',
    ),
  ).toHaveLength(2);
  expect(state.session.filters.search).toBe('no match');
});
it('reveals a single Details only through explicit selection and shares the Movement stack', () => {
  const state = snapshot(),
    bridge = new WorkspaceBridge({ initialViews: ['tactical'] });
  const runtime = {
    selectEntity: vi.fn(),
    getSnapshot: () => state,
  } as unknown as ApplicationRuntime;
  selectForDetails(runtime, bridge, state.session.selection.primary!.id, true);
  const parent = bridge.layoutModel.getNodeById('details')!.getParent();
  selectForDetails(runtime, bridge, state.session.selection.primary!.id);
  bridge.open('movement');
  bridge.openInspector(
    state.presentation.frame!.mission.id,
    'pinned',
    'Pinned',
  );
  expect(
    bridge.getSnapshot().views.filter((v) => v.id === 'details'),
  ).toHaveLength(1);
  expect(bridge.layoutModel.getNodeById('movement')!.getParent()).toBe(parent);
  expect(runtime.selectEntity).toHaveBeenNthCalledWith(
    1,
    state.session.selection.primary!.id,
    true,
  );
  bridge.close('details');
  // A new presentation and opening other navigation do not invoke an explicit selection.
  state.presentation = { ...state.presentation };
  bridge.setSidebar('fleet');
  bridge.open('tactical');
  expect(bridge.layoutModel.getNodeById('details')).toBeUndefined();
  bridge.dispose();
});
it('keeps group selection when toggling the primary trail and preserves zero measurements', () => {
  const state = snapshot(),
    bridge = new WorkspaceBridge();
  const runtime = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    selectEntity: vi.fn(),
    setHistoryVisible: vi.fn(),
  } as unknown as ApplicationRuntime;
  render(
    <OperationalContext.Provider value={runtime}>
      <EntityDetails bridge={bridge} />
    </OperationalContext.Provider>,
  );
  expect(screen.getByText('0 m/s')).toBeTruthy();
  expect(screen.getByText('Follows selection · 2 selected')).toBeTruthy();
  fireEvent.click(screen.getByText('Observed trail', { exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Show observed trail' }));
  expect(runtime.selectEntity).not.toHaveBeenCalled();
  expect(runtime.setHistoryVisible).toHaveBeenCalledWith(true);
  expect(
    screen.getByText('Measurements & sources · display ≠ control'),
  ).toBeTruthy();
  bridge.dispose();
});
it('copies the exact zero or full timestamp and reports clipboard failure without dropping the value', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  const time = '2026-09-15T12:00:00.123Z';
  render(
    <dl>
      <CopyValue label="Speed" value={0} />
      <CopyValue label="Observed UTC" value={time} />
    </dl>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copy Speed' }));
  await screen.findByText('Speed copied');
  expect(writeText).toHaveBeenLastCalledWith('0');
  writeText.mockRejectedValueOnce(new Error('Denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy Observed UTC' }));
  await screen.findByText(/Copy unavailable/);
  expect(screen.getByText(time)).toBeTruthy();
});
it('collapses navigation before moving the auxiliary stack below maps while retaining identities and camera bookmarks', () => {
  const bridge = new WorkspaceBridge();
  bridge.revealDetails();
  bridge.setSidebar('fleet');
  const camera = {
    center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
    groundSpanM: 3000,
    headingTrueDeg: 0,
  };
  bridge.setMapCamera('tactical', 'demo', camera);
  bridge.setViewportWidth(1100);
  expect(bridge.getSnapshot().sidebarOpen).toBe(false);
  bridge.setViewportWidth(800);
  const ids = bridge.getSnapshot().views.map((v) => v.id);
  bridge.setViewportWidth(1920);
  expect(bridge.getSnapshot().views.map((v) => v.id)).toEqual(ids);
  expect(bridge.getSnapshot().sidebarOpen).toBe(false);
  expect(bridge.getMapCamera('tactical', 'demo')).toMatchObject(camera);
  bridge.dispose();
});
