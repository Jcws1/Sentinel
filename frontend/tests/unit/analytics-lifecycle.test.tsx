import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {
  PaneVisibilityContext,
  OperationalContext,
} from '../../src/app/OperationalContext';
import { ChartHost } from '../../src/features/analytics/ChartHost';
import { summarizeTelemetry } from '../../src/features/analytics/ObservedTelemetry';
import type { ObservedHistory } from '../../src/contracts/generated';
import raw from '../../../contracts/sentinel/v1.16/fixture.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import type {
  ApplicationRuntime,
  RuntimeSnapshot,
} from '../../src/app/runtime';
import type { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import { projectCurrent } from '../../src/features/analytics/projections';
import { VerticalProfile } from '../../src/features/analytics/VerticalProfile';
import {
  Comparison,
  CommandPicture,
} from '../../src/features/analytics/CommandPicture';
import { ObservedTelemetry } from '../../src/features/analytics/ObservedTelemetry';
import { profileTooltipContent } from '../../src/features/analytics/profileSeries';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  dispose: vi.fn(),
  setOption: vi.fn(),
  resize: vi.fn(),
  on: vi.fn(),
  flush: vi.fn(),
  getZr: vi.fn(),
}));
vi.mock('echarts/core', () => ({ use: vi.fn(), init: mocks.init }));
vi.mock('../../src/features/analytics/profileLayer', () => ({
  createProfileLayer: () => ({
    paint: vi.fn(),
    dispose: vi.fn(),
    tooltip: vi.fn(),
    htmlTooltip: vi.fn(),
  }),
  profileMotionBounds: () => [],
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getZr.mockReturnValue({ flush: mocks.flush });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('profile tooltip uses its owner document and preserves source text without interpreting markup', () => {
  const owner = document.implementation.createHTMLDocument('chart owner');
  const text =
    'Original {raw|name} <img src=x onerror="bad()"> & Ω\nDistance: 1.250 km';
  const content = profileTooltipContent(owner, text);
  expect(content.ownerDocument).toBe(owner);
  expect(content.getAttribute('role')).toBe('tooltip');
  expect(content.textContent).toBe(text);
  expect(content.children).toHaveLength(0);
  expect(content.innerHTML).toContain('&lt;img');
});

it('chart host disposes hidden/detached resources, reopens, and picks using the latest callback', () => {
  mocks.init.mockReturnValue(mocks);
  let resize!: () => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(10);
    return 1;
  });
  const stop = vi.fn(),
    subscribe = vi.fn(() => stop),
    motion = { subscribe };
  const pick = vi.fn(),
    latest = vi.fn();
  const content = (visible: boolean, onPick = pick) => (
    <PaneVisibilityContext.Provider value={visible}>
      <ChartHost option={{}} label="Test" motion={motion} onPick={onPick} />
    </PaneVisibilityContext.Provider>
  );
  const view = render(content(true));
  expect(mocks.init).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledTimes(1);
  view.rerender(content(true, latest));
  act(() => mocks.on.mock.calls[0][1]({ data: { entityId: 'shared-entity' } }));
  expect(latest).toHaveBeenCalledWith('shared-entity');
  expect(pick).not.toHaveBeenCalled();
  act(() =>
    mocks.on.mock.calls[0][1]({
      data: [2, 180, 'opaque:/profile-id'],
      value: [2, 180, 'opaque:/profile-id'],
      dimensionNames: ['distanceKm', 'altitudeMetres', 'entityId'],
    }),
  );
  expect(latest).toHaveBeenLastCalledWith('opaque:/profile-id');
  act(() => resize());
  expect(mocks.resize).toHaveBeenCalledTimes(1);
  hidden.mockReturnValue(true);
  // A background document may never run a scheduled animation frame.
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(2);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
  hidden.mockReturnValue(false);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(20);
    return 3;
  });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.init).toHaveBeenCalledTimes(2);
  view.rerender(content(false));
  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(2);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(mocks.init).toHaveBeenCalledTimes(2);
  view.rerender(content(true));
  view.unmount();
  expect(mocks.dispose).toHaveBeenCalledTimes(3);
  expect(disconnect).toHaveBeenCalledTimes(2);
});

it('chart motion refreshes callbacks without rebuilding and cancels pending hidden or superseded work', () => {
  mocks.init.mockReturnValue(mocks);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let next = 0,
    notify!: (now: number) => void;
  const pending = new Map<number, FrameRequestCallback>();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    pending.set(++next, callback);
    return next;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    pending.delete(id);
  });
  const stop = vi.fn(),
    motion = {
      subscribe(callback: (now: number) => void) {
        notify = callback;
        return stop;
      },
    };
  const first = vi.fn(),
    latest = vi.fn(),
    disposeLayer = vi.fn(),
    option = {};
  const content = (onMotion = first, value = option) => (
    <ChartHost
      option={value}
      label="Motion"
      motion={motion}
      onMotion={onMotion}
      onDispose={disposeLayer}
      replaceSeries
    />
  );
  const clock = vi.spyOn(window.performance, 'now').mockReturnValue(0);
  const view = render(content());
  expect(first.mock.calls).toEqual([[mocks, 0]]);
  expect(mocks.setOption.mock.invocationCallOrder[0]).toBeLessThan(
    first.mock.invocationCallOrder[0],
  );
  expect(first.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.flush.mock.invocationCallOrder[0],
  );
  notify(0);
  const initial = [...pending.values()][0];
  pending.clear();
  initial(0);
  notify(6);
  view.rerender(content(latest));
  expect(mocks.setOption).toHaveBeenCalledTimes(1);
  const trailing = [...pending.values()][0];
  pending.clear();
  clock.mockReturnValue(20);
  trailing(20);
  expect(first.mock.calls).toEqual([
    [mocks, 0],
    [mocks, 0],
  ]);
  expect(latest.mock.calls).toEqual([[mocks, 20]]);
  notify(25);
  const superseded = [...pending.values()][0];
  view.rerender(content(latest, { animation: false }));
  superseded(40);
  expect(latest).toHaveBeenCalledTimes(2);
  expect(pending.size).toBe(0);
  notify(30);
  notify(35);
  const background = [...pending.values()][0];
  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  background(60);
  expect(latest.mock.calls).toEqual([
    [mocks, 20],
    [mocks, 20],
  ]);
  expect(pending.size).toBe(0);
  expect(stop).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(disposeLayer).toHaveBeenCalledOnce();
  expect(disposeLayer.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.dispose.mock.invocationCallOrder[0],
  );
});

function analyticFixture() {
  const frame = validateFrame(structuredClone(raw)),
    session = initialSession(frame.mission.id);
  frame.mission.referencePoint = {
    longitudeDeg: 0,
    latitudeDeg: 0,
    altitude: { reference: 'ELLIPSOID', metres: 0 },
  };
  const track = Object.values(frame.tracks)[0];
  session.selection = {
    missionId: frame.mission.id,
    revision: 1,
    primary: { kind: 'entity', id: track.entityId },
    items: [{ kind: 'entity', id: track.entityId }],
  };
  const history: ObservedHistory = {
    schemaVersion: '1.0',
    missionId: frame.mission.id,
    entityId: track.entityId,
    recordingId: frame.recordingId,
    streamEpoch: frame.streamEpoch,
    throughFrameId: frame.frameId,
    throughSequence: frame.sequence,
    throughAt: frame.effectiveAt,
    fromAt: new Date(Date.parse(frame.effectiveAt) - 60000).toISOString(),
    windowSeconds: 60,
    maxGapSeconds: 30,
    inspectedFrames: 1,
    truncated: false,
    segments: [
      {
        trackId: track.id,
        historySeriesId: track.historySeriesId,
        source: track.source,
        breakReason: 'window-start',
        points: [
          {
            frameId: frame.frameId,
            sequence: frame.sequence,
            recordedAt: frame.recordedAt,
            frameEffectiveAt: frame.effectiveAt,
            sample: track.latest,
          },
        ],
      },
    ],
  };
  const state = {
    presentation: { frame, status: 'current' },
    session,
    observed: { status: 'ready', data: history },
  } as unknown as RuntimeSnapshot;
  const runtime = {
    profileHistoryDemand: vi.fn(),
    motion: {
      subscribe: () => () => {},
      sampleTrack: (_f: string, _t: string, p: unknown) => p,
    },
    readObservedHistory: vi.fn(async () => history),
  } as unknown as ApplicationRuntime;
  const bridge = {} as WorkspaceBridge;
  mocks.init.mockReturnValue(mocks);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  return { frame, track, history, state, runtime, bridge };
}

it('current count bars do not redraw unchanged values while their frame header advances', () => {
  const { state, runtime, bridge, frame } = analyticFixture();
  let snapshot = state;
  Object.assign(runtime, {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
    analytics: { get: projectCurrent },
  });
  const content = () => (
    <OperationalContext.Provider value={runtime}>
      <CommandPicture bridge={bridge} />
    </OperationalContext.Provider>
  );
  const view = render(content());
  const updates = mocks.setOption.mock.calls.length;
  const laterFrame = {
    ...frame,
    frameId: 'later-counts',
    sequence: frame.sequence + 1,
  };
  snapshot = {
    ...state,
    presentation: { ...state.presentation, frame: laterFrame },
  };
  view.rerender(content());
  expect(
    view.container
      .querySelector('[data-analytic-frame]')
      ?.getAttribute('data-analytic-frame'),
  ).toBe('later-counts');
  expect(mocks.setOption).toHaveBeenCalledTimes(updates);
  const changed = structuredClone(laterFrame);
  Object.values(changed.entities)[0].affiliation = 'neutral';
  snapshot = {
    ...snapshot,
    presentation: { ...snapshot.presentation, frame: changed },
  };
  view.rerender(content());
  expect(mocks.setOption.mock.calls.length).toBeGreaterThan(updates);
});

it('comparison reuses unchanged bars but updates identities, missing values and signed altitude', () => {
  const { state, runtime, bridge, frame, track } = analyticFixture();
  const content = () => (
    <Comparison
      projection={projectCurrent(state)!}
      state={state}
      runtime={runtime}
      bridge={bridge}
    />
  );
  const view = render(content());
  const updates = mocks.setOption.mock.calls.length;
  state.session = structuredClone(state.session);
  view.rerender(content());
  expect(mocks.setOption).toHaveBeenCalledTimes(updates);
  frame.entities[track.entityId].label = 'Changed label';
  view.rerender(content());
  expect(mocks.setOption).toHaveBeenCalledTimes(updates + 1);
  expect(mocks.setOption.mock.calls.at(-1)![0].yAxis.data).toEqual([
    'Changed label',
  ]);
  track.latest.position.altitude = { reference: 'ELLIPSOID', metres: -185 };
  fireEvent.change(view.getByRole('combobox', { name: 'Measurement' }), {
    target: { value: 'altitude' },
  });
  expect(mocks.setOption.mock.calls.at(-1)![0].xAxis).toMatchObject({
    min: undefined,
    scale: false,
  });
  expect(mocks.setOption.mock.calls.at(-1)![0].series[0].data).toEqual([
    { entityId: track.entityId, value: -185 },
  ]);
  state.session = {
    ...state.session,
    filters: { ...state.session.filters, search: 'not-present-anywhere' },
  };
  view.rerender(content());
  expect(mocks.setOption.mock.calls.at(-1)![0].series[0].data).toEqual([
    { entityId: track.entityId, value: null },
  ]);
  expect(view.getByText('Unknown')).toBeTruthy();
});

it('AGL-only current, historical and comparison values remain excluded when no datum is selectable', () => {
  const { frame, state, runtime, bridge } = analyticFixture();
  for (const t of Object.values(frame.tracks))
    t.latest.position.altitude.reference = 'AGL';
  const projection = projectCurrent(state)!;
  const profile = render(
    <VerticalProfile
      runtime={runtime}
      state={state}
      projection={projection}
      bridge={bridge}
    />,
  );
  expect(profile.getByText(/Axis: unavailable. 0 plotted/)).toBeTruthy();
  fireEvent.click(
    profile.getByRole('checkbox', { name: 'Selected observed history' }),
  );
  expect(profile.getByText(/0 compatible samples/)).toBeTruthy();
  expect(profile.getByRole('status').textContent).toContain(
    '1 excluded: 1 incompatible altitude',
  );
  expect(
    mocks.setOption.mock.calls
      .at(-1)![0]
      .series.every((s: { data: unknown[] }) => s.data.length === 0),
  ).toBe(true);
  profile.unmount();
  const comparison = render(
    <Comparison
      projection={projection}
      state={state}
      runtime={runtime}
      bridge={bridge}
    />,
  );
  fireEvent.change(comparison.getByRole('combobox', { name: 'Measurement' }), {
    target: { value: 'altitude' },
  });
  expect(comparison.getByText('Unknown')).toBeTruthy();
});

it('Profile counts incompatible history and origin exclusions only within its displayed window', () => {
  const { frame, track, history, state, runtime, bridge } = analyticFixture();
  for (const t of Object.values(frame.tracks))
    t.latest.position.altitude = { reference: 'ELLIPSOID', metres: 180 };
  const segment = history.segments[0];
  const point = (
    secondsAgo: number,
    reference: 'ELLIPSOID' | 'MSL' | 'AGL',
  ) => ({
    ...segment.points[0],
    sample: {
      ...track.latest,
      timestamp: new Date(
        Date.parse(track.latest.timestamp) - secondsAgo * 1000,
      ).toISOString(),
      position: {
        ...track.latest.position,
        altitude: { reference, metres: 180 },
      },
    },
  });
  history.segments = [
    { ...segment, points: [point(40, 'MSL')] },
    {
      ...segment,
      breakReason: 'altitude-reference',
      points: [point(12, 'MSL')],
    },
    {
      ...segment,
      breakReason: 'altitude-reference',
      points: [point(10, 'AGL')],
    },
    {
      ...segment,
      breakReason: 'altitude-reference',
      points: [point(5, 'ELLIPSOID'), point(0, 'ELLIPSOID')],
    },
  ];
  const view = render(
    <VerticalProfile
      runtime={runtime}
      state={state}
      projection={projectCurrent(state)!}
      bridge={bridge}
    />,
  );
  fireEvent.click(
    view.getByRole('checkbox', { name: 'Selected observed history' }),
  );
  fireEvent.change(view.getByRole('combobox', { name: 'History range' }), {
    target: { value: '15' },
  });
  expect(view.getByRole('status').textContent).toContain(
    '2 compatible samples',
  );
  expect(view.getByRole('status').textContent).toContain(
    'Of 4 retained samples in this track/source plot window, 2 excluded: 2 incompatible altitude, 0 before captured origin, 0 without an origin.',
  );
  fireEvent.click(
    view.getByRole('button', { name: 'Use selected position as fixed origin' }),
  );
  expect(view.getByRole('status').textContent).toContain(
    '1 compatible samples',
  );
  expect(view.getByRole('status').textContent).toContain(
    'Of 4 retained samples in this track/source plot window, 3 excluded: 2 incompatible altitude, 1 before captured origin, 0 without an origin.',
  );
  expect(history.segments[1].points[0].sample.position.altitude.reference).toBe(
    'MSL',
  );
  delete frame.mission.referencePoint;
  fireEvent.click(
    view.getByRole('button', { name: /^Use mission reference$/ }),
  );
  expect(view.getByRole('status').textContent).toContain(
    '4 excluded: 0 incompatible altitude, 0 before captured origin, 4 without an origin.',
  );
});

it('comparison retains an unavailable selected identity with unknown values and no invented bar', () => {
  const { frame, state, runtime, bridge, track } = analyticFixture();
  delete frame.entities[track.entityId];
  const view = render(
    <Comparison
      projection={projectCurrent(state)!}
      state={state}
      runtime={runtime}
      bridge={bridge}
    />,
  );
  expect(view.getByRole('button', { name: track.entityId })).toBeTruthy();
  expect(view.getByText('Unavailable in this frame')).toBeTruthy();
  expect(view.getAllByText('Unknown')).toHaveLength(2);
  expect(view.queryByText(/Select entities from/)).toBeNull();
  expect(mocks.setOption.mock.calls.at(-1)![0].series[0].data).toEqual([
    { entityId: track.entityId, value: null },
  ]);
  expect(state.session.selection.primary).toEqual({
    kind: 'entity',
    id: track.entityId,
  });
});

it('mixed available and unavailable comparisons retain shared selection order and raw values', () => {
  const { frame, state, runtime, bridge, track } = analyticFixture();
  const missing = {
    kind: 'entity' as const,
    id: 'recorded-but-no-longer-present',
  };
  state.session = {
    ...state.session,
    selection: {
      ...state.session.selection,
      primary: missing,
      items: [missing, ...state.session.selection.items],
    },
  };
  const view = render(
    <Comparison
      projection={projectCurrent(state)!}
      state={state}
      runtime={runtime}
      bridge={bridge}
    />,
  );
  expect(
    Array.from(view.container.querySelectorAll('tbody button')).map(
      (button) => button.textContent,
    ),
  ).toEqual([missing.id, frame.entities[track.entityId].label]);
  expect(mocks.setOption.mock.calls.at(-1)![0].series[0].data).toEqual([
    { entityId: missing.id, value: null },
    {
      entityId: track.entityId,
      value: track.latest.velocity?.speedMps ?? null,
    },
  ]);
});

it('historical numeric inspection preserves timestamp and segment reason without another query', () => {
  const { state, runtime, bridge, track } = analyticFixture();
  const view = render(
    <VerticalProfile
      runtime={runtime}
      state={state}
      projection={projectCurrent(state)!}
      bridge={bridge}
    />,
  );
  fireEvent.click(
    view.getByRole('checkbox', { name: 'Selected observed history' }),
  );
  fireEvent.click(view.getByText('Inspect 1 plotted historical observations'));
  expect(view.getByText('1 · window-start')).toBeTruthy();
  expect(view.getAllByText(track.latest.timestamp).length).toBeGreaterThan(0);
  expect(runtime.readObservedHistory).not.toHaveBeenCalled();
});

it('Profile ignores cloned unchanged filters while retaining frame-based history trimming', () => {
  const { state, runtime, bridge, frame, track } = analyticFixture();
  const projection = projectCurrent(state)!;
  const view = render(
    <VerticalProfile
      runtime={runtime}
      state={state}
      projection={projection}
      bridge={bridge}
    />,
  );
  fireEvent.click(
    view.getByRole('checkbox', { name: 'Selected observed history' }),
  );
  fireEvent.change(view.getByRole('combobox', { name: 'History range' }), {
    target: { value: '15' },
  });
  expect(view.getByText(/1 compatible samples/)).toBeTruthy();
  expect(view.getByRole('status').textContent).toContain(
    `15-second plot · retained 60-second read through source ${frame.effectiveAt}`,
  );
  const updates = mocks.setOption.mock.calls.length;
  const cloned = {
    ...state,
    session: {
      ...state.session,
      filters: structuredClone(state.session.filters),
    },
  };
  view.rerender(
    <VerticalProfile
      runtime={runtime}
      state={cloned}
      projection={projection}
      bridge={bridge}
    />,
  );
  expect(mocks.setOption).toHaveBeenCalledTimes(updates);
  const laterFrame = {
    ...frame,
    frameId: 'later-profile-frame',
    sequence: frame.sequence + 1,
    effectiveAt: new Date(
      Date.parse(track.latest.timestamp) + 16000,
    ).toISOString(),
  };
  const later = {
    ...cloned,
    presentation: { ...state.presentation, frame: laterFrame },
  };
  view.rerender(
    <VerticalProfile
      runtime={runtime}
      state={later}
      projection={projectCurrent(later)!}
      bridge={bridge}
    />,
  );
  expect(view.getByText(/0 compatible samples/)).toBeTruthy();
  expect(view.getByRole('status').textContent).toContain(
    `Plot window ends at source ${laterFrame.effectiveAt}`,
  );
  expect(
    mocks.setOption.mock.calls
      .at(-1)![0]
      .series.map((s: { id: string }) => s.id),
  ).toEqual(['current', 'motion-axis-bounds']);
});

it('Profile exposes a failed history reason and retries through the shared owner', () => {
  const { state, runtime, bridge } = analyticFixture();
  runtime.retryHistory = vi.fn();
  state.observed = {
    status: 'error',
    error: 'Observed history read timed out.',
  };
  const view = render(
    <VerticalProfile
      runtime={runtime}
      state={state}
      projection={projectCurrent(state)!}
      bridge={bridge}
    />,
  );
  fireEvent.click(
    view.getByRole('checkbox', { name: 'Selected observed history' }),
  );
  expect(view.getByRole('status').textContent).toContain('read timed out');
  fireEvent.click(view.getByRole('button', { name: 'Retry history' }));
  expect(runtime.retryHistory).toHaveBeenCalledOnce();
});

it.each([
  'missionId',
  'entityId',
  'recordingId',
  'streamEpoch',
  'throughFrameId',
  'throughSequence',
  'throughAt',
  'windowSeconds',
] as const)(
  'telemetry rejects a mismatched %s response at its pinned cutoff',
  async (field) => {
    const { frame, track, history, runtime } = analyticFixture();
    Object.assign(history, {
      [field]:
        typeof history[field] === 'number'
          ? Number(history[field]) + 1
          : 'different',
    });
    const view = render(
      <ObservedTelemetry
        runtime={runtime}
        anchor={frame}
        entityId={track.entityId}
      />,
    );
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toContain('anchor mismatch'),
    );
    expect(view.queryByText('Horizontal speed m/s')).toBeNull();
  },
);

it('telemetry uses retained observations once, preserves zero and separates altitude datums', () => {
  const point = (
    timestamp: string,
    metres: number,
    reference: string,
    speed?: number,
  ) => ({
    sample: {
      timestamp,
      position: {
        longitudeDeg: 0,
        latitudeDeg: 0,
        altitude: { metres, reference },
      },
      ...(speed == null ? {} : { velocity: { speedMps: speed } }),
    },
  });
  const a = point('2026-09-10T00:00:01.000Z', 100, 'MSL', 0);
  const data = {
    segments: [
      {
        trackId: 't',
        historySeriesId: 's',
        source: { id: 'one' },
        points: [a, a, point('2026-09-10T00:00:02.000Z', 120, 'ELLIPSOID', 10)],
      },
      {
        trackId: 't',
        historySeriesId: 's',
        source: { id: 'two' },
        points: [point('2026-09-10T00:00:03.000Z', 30, 'AGL')],
      },
    ],
  } as unknown as ObservedHistory;
  const stats = summarizeTelemetry(data);
  expect(stats.samples).toBe(3);
  expect(stats.missingSpeed).toBe(1);
  expect(stats.speed).toEqual({ count: 2, min: 0, max: 10, mean: 5 });
  expect(stats.excludedAltitude).toBe(1);
  expect(stats.altitudes.map((a) => [a.group, a.mean])).toEqual([
    ['MSL · unspecified datum · source one', 100],
    ['ELLIPSOID · WGS84', 120],
  ]);
});
