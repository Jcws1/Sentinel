import { captureScriptControl } from '../world/scriptControl';
import { captureBehavior, interceptSelection } from '../world/behavior';
import { createEngagementCues } from '../world/engagementCues';
import { createMotionPresentation } from '../world/motionPresentation';
import {
  createDisplayPreferences,
  type DisplayPreferences,
} from '../state/displayPreferences';
import type { BehaviorPolicy, DemoOutcome } from '../contracts/generated';
import {
  createLiveBoundaryEditor,
  type LiveBoundaryState,
} from '../services/liveBoundaryEditor';
import {
  createInteractiveClient,
  type InteractiveState,
} from '../services/interactiveClient';
import type { Action } from '../services/interactiveClient';
import {
  captureMovement,
  reviewMovement,
  draftReason,
} from '../world/movement';
import { captureDirectMove } from '../world/directMovement';
import { decodeStream } from '../contracts/decode';
import {
  withinScenarioExtent,
  decodeScenarioWrite,
} from '../contracts/scenarios';
import {
  createScenarioClient,
  type ScenarioState,
  type ScenarioUnitEdit,
} from '../services/scenarioClient';
import type { ScenarioContent, UnitPlacement } from '../contracts/generated';
import type { DeepReadonly, ImmutableFrame, Mission } from '../contracts/types';
import { createApi, type Fetcher } from '../services/api';
import {
  createBrowserSocket,
  streamUrl,
  type SocketFactory,
  type StreamSocket,
} from '../services/worldStream';
import {
  createSessionStore,
  initialSession,
  type SessionState,
  type FilterState,
} from '../state/sessionStore';
import { createWorldStore, type ConnectionStatus } from '../state/worldStore';
import { createHistoryCache } from '../world/historyCache';
import { immutableCopy } from '../world/immutable';
import {
  derivePresentation,
  type PresentationFrame,
} from '../world/presentation';
import { applyDelta } from '../world/reduce';
import {
  createObservedHistory,
  type ObservedState,
} from '../world/observedHistory';

export interface RuntimeSnapshot {
  display?: Readonly<DisplayPreferences>;
  displayPersistence?: 'local' | 'session';
  engagementCues?: readonly DeepReadonly<DemoOutcome>[];
  catalog: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    missions: readonly DeepReadonly<Mission>[];
    fixtureAdvanceEnabled?: boolean;
    error?: string;
  };
  connection: ConnectionStatus;
  error?: string;
  missionId?: string;
  presentation: PresentationFrame;
  session: DeepReadonly<SessionState>;
  advancing: boolean;
  advanceError?: string;
  observed: ObservedState;
  interactive: DeepReadonly<InteractiveState>;
  browserMode: 'all' | 'fleet';
  scenario: DeepReadonly<ScenarioState>;
  liveBoundary?: DeepReadonly<LiveBoundaryState>;
  liveBoundaryView?: DeepReadonly<
    ReturnType<ReturnType<typeof createLiveBoundaryEditor>['view']>
  >;
}
export interface RuntimeDependencies {
  displayStorage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  apiBase?: string;
  pageUrl?: string;
  fetcher?: Fetcher;
  createSocket?: SocketFactory;
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  heartbeatTimeoutMs?: number;
  requestTimeoutMs?: number;
  reconnectDelayMs?: number;
}

/** One instance per application session. Panes only subscribe; they never connect. */
export function createRuntime(dependencies: RuntimeDependencies = {}) {
  const apiBase = dependencies.apiBase ?? '/api';
  const pageUrl =
    dependencies.pageUrl ?? globalThis.location?.href ?? 'http://localhost/';
  const api = createApi(
    apiBase,
    dependencies.fetcher ?? ((input, init) => fetch(input, init)),
  );
  const createSocket = dependencies.createSocket ?? createBrowserSocket;
  const setTimer = dependencies.setTimer ?? setTimeout;
  const clearTimer = dependencies.clearTimer ?? clearTimeout;
  const heartbeatTimeout = dependencies.heartbeatTimeoutMs ?? 15_000;
  const requestTimeout = dependencies.requestTimeoutMs ?? 10_000;
  const reconnectDelay = dependencies.reconnectDelayMs ?? 500;
  const world = createWorldStore();
  const session = createSessionStore();
  const history = createHistoryCache();
  const engagementCues = createEngagementCues();
  const motion = createMotionPresentation();
  const display = createDisplayPreferences(dependencies.displayStorage);
  const listeners = new Set<() => void>();
  let catalog: RuntimeSnapshot['catalog'] = { status: 'idle', missions: [] };
  let advancing = false;
  let advanceError: string | undefined;
  let snapshot: RuntimeSnapshot;
  let disposed = false;
  let missionGeneration = 0;
  let socketGeneration = 0;
  let catalogGeneration = 0;
  let advanceGeneration = 0;
  let socket: StreamSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let catalogTimer: ReturnType<typeof setTimeout> | undefined;
  let advanceTimer: ReturnType<typeof setTimeout> | undefined;
  let catalogAbort: AbortController | undefined;
  let advanceAbort: AbortController | undefined;
  let reconnectAttempts = 0;
  let browserMode: 'all' | 'fleet' = 'all';
  const observed = createObservedHistory(
    api.observedHistory,
    publish,
    requestTimeout,
  );

  const interactive = createInteractiveClient({
    base: apiBase,
    fetcher: dependencies.fetcher ?? ((input, init) => fetch(input, init)),
    publish,
    loadMission: (id) => {
      owner.loadMission(id);
      void owner.loadMissions();
    },
    timeoutMs: requestTimeout,
  });
  const scenarios = createScenarioClient({
    base: apiBase,
    fetcher: dependencies.fetcher ?? ((input, init) => fetch(input, init)),
    publish,
    timeoutMs: requestTimeout,
  });
  const liveBoundaries = createLiveBoundaryEditor({
    publish,
    submit: (mutation) =>
      interactive.perform(
        'boundary-edit',
        undefined,
        undefined,
        undefined,
        mutation,
      ),
  });
  const boundaryOwner = () =>
    scenarios.get().active ? scenarios : liveBoundaries;
  function publish() {
    const cache = world.getState();
    const operational = session.getState();
    const commandState = interactive.get();
    const presentation = derivePresentation(
      cache,
      operational,
      history,
      commandState.now,
    );
    liveBoundaries.sync(
      presentation.mode === 'live' && cache.connection === 'connected'
        ? presentation.frame
        : undefined,
      commandState,
    );
    observed.sync(
      presentation.frame,
      operational.selection.primary?.kind === 'entity'
        ? operational.selection.primary.id
        : undefined,
      !!operational.overlays.history,
      operational.overlays.historyWindowSeconds ?? 60,
    );
    snapshot = Object.freeze({
      display: display.get(),
      displayPersistence: display.persistence(),
      catalog: immutableCopy(catalog),
      connection: cache.connection,
      error: cache.error,
      missionId: operational.missionId,
      presentation: Object.freeze(presentation),
      engagementCues: engagementCues(
        presentation,
        cache.connection === 'connected',
        scenarios.get().active,
      ),
      observed: observed.get(),
      interactive: commandState,
      scenario: scenarios.get(),
      liveBoundary: liveBoundaries.get(),
      liveBoundaryView: immutableCopy(liveBoundaries.view()),
      browserMode,
      session: immutableCopy(operational),
      advancing,
      advanceError,
    });
    motion.update(
      presentation,
      cache.connection === 'connected',
      scenarios.get().active,
    );
    for (const listener of listeners) listener();
  }
  function cancelCatalog() {
    catalogGeneration++;
    catalogAbort?.abort();
    catalogAbort = undefined;
    if (catalogTimer !== undefined) clearTimer(catalogTimer);
    catalogTimer = undefined;
    if (catalog.status === 'loading') catalog = { ...catalog, status: 'idle' };
  }
  function cancelAdvance() {
    advanceGeneration++;
    advanceAbort?.abort();
    advanceAbort = undefined;
    if (advanceTimer !== undefined) clearTimer(advanceTimer);
    advanceTimer = undefined;
    advancing = false;
    advanceError = undefined;
  }
  function closeSocket() {
    socketGeneration++;
    if (deadlineTimer !== undefined) clearTimer(deadlineTimer);
    deadlineTimer = undefined;
    const previous = socket;
    socket = undefined;
    if (previous) {
      previous.onmessage = null;
      previous.onclose = null;
      previous.onerror = null;
      previous.close();
    }
  }
  function cancelTransport() {
    if (retryTimer !== undefined) clearTimer(retryTimer);
    retryTimer = undefined;
    closeSocket();
  }
  function failConnection(message: string) {
    if (disposed || !session.getState().missionId) return;
    closeSocket();
    world.setState({
      connection: world.getState().live ? 'stale' : 'disconnected',
      error: message,
    });
    publish();
    if (retryTimer !== undefined) clearTimer(retryTimer);
    const generation = missionGeneration;
    retryTimer = setTimer(
      () => {
        retryTimer = undefined;
        if (!disposed && generation === missionGeneration) connect();
      },
      Math.min(reconnectDelay * 2 ** Math.min(reconnectAttempts++, 5), 10_000),
    );
  }
  function publishFrame(frame: ImmutableFrame) {
    // Preserve missing selection IDs: the detail view reports unavailable data.
    if (
      world.getState().connection !== 'connected' &&
      observed.get().status === 'error'
    )
      observed.retry();
    world.setState({ live: frame, connection: 'connected', error: undefined });
    reconnectAttempts = 0;
    publish();
    interactive.setMission(frame.interactive ? frame.mission.id : undefined);
  }
  function connect() {
    const missionId = session.getState().missionId;
    if (disposed || !missionId) return;
    cancelTransport();
    world.setState({
      connection: world.getState().live ? 'stale' : 'connecting',
    });
    publish();
    const generation = socketGeneration;
    let awaitingSnapshot = true;
    const valid = () =>
      !disposed &&
      generation === socketGeneration &&
      missionId === session.getState().missionId;
    const refreshDeadline = () => {
      if (deadlineTimer !== undefined) clearTimer(deadlineTimer);
      deadlineTimer = setTimer(() => {
        if (valid())
          failConnection(
            'Backend stream timed out. Reconnecting for a fresh snapshot.',
          );
      }, heartbeatTimeout);
    };
    try {
      socket = createSocket(streamUrl(apiBase, missionId, pageUrl));
      socket.onmessage = (event) => {
        if (!valid()) return;
        try {
          if (typeof event.data !== 'string')
            throw new Error('Unsupported stream payload');
          const message = decodeStream(event.data);
          if (message.missionId !== missionId)
            throw new Error('Stream mission mismatch');
          if (message.type === 'resync-required')
            throw new Error('Backend requested a fresh snapshot');
          const previous = world.getState().live;
          if (message.type === 'snapshot') {
            if (!awaitingSnapshot)
              throw new Error('Unexpected snapshot in active stream');
            if (previous?.streamEpoch === message.streamEpoch) {
              if (message.frame.recordingId !== previous.recordingId)
                throw new Error(
                  'Recording identity changed within the same stream epoch',
                );
              if (message.sequence < previous.sequence)
                throw new Error(
                  'Snapshot regressed within the same stream epoch',
                );
              if (
                message.sequence === previous.sequence &&
                message.frame.frameId !== previous.frameId
              ) {
                throw new Error(
                  'Snapshot identity changed at the same sequence',
                );
              }
            }
            awaitingSnapshot = false;
            publishFrame(
              previous?.streamEpoch === message.streamEpoch &&
                previous.sequence === message.sequence
                ? previous
                : immutableCopy(message.frame),
            );
          } else if (message.type === 'heartbeat' || message.type === 'delta') {
            if (awaitingSnapshot || !previous)
              throw new Error('Stream did not begin with a snapshot');
            if (message.streamEpoch !== previous.streamEpoch)
              throw new Error('Stream epoch changed');
            if (message.type === 'heartbeat') {
              if (message.sequence > previous.sequence)
                throw new Error('Heartbeat exposed a missing frame');
            } else if (
              message.type === 'delta' &&
              message.sequence > previous.sequence
            ) {
              if (
                message.previousSequence !== previous.sequence ||
                message.sequence !== previous.sequence + 1
              ) {
                throw new Error('Stream sequence gap');
              }
              publishFrame(applyDelta(previous, message));
            } else if (
              message.type === 'delta' &&
              message.sequence === previous.sequence &&
              message.frameId !== previous.frameId
            ) {
              throw new Error('Conflicting frame at duplicate sequence');
            }
          } else throw new Error('Missing stream discriminator');
          refreshDeadline();
        } catch (error) {
          failConnection(
            `${error instanceof Error ? error.message : 'Invalid backend message'}. Resnapshot required.`,
          );
        }
      };
      socket.onerror = () => {
        if (valid())
          failConnection('Backend stream unavailable. Reconnecting.');
      };
      socket.onclose = () => {
        if (valid())
          failConnection('Backend stream disconnected. Reconnecting.');
      };
      refreshDeadline();
    } catch {
      failConnection('Backend stream could not be opened. Reconnecting.');
    }
  }

  publish();
  const owner = {
    motion,
    getSnapshot: () => snapshot,
    getPresentationFrame: () => snapshot.presentation,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async loadMissions() {
      if (disposed) return;
      cancelCatalog();
      const generation = catalogGeneration;
      const controller = new AbortController();
      catalogAbort = controller;
      catalog = { ...catalog, status: 'loading', error: undefined };
      publish();
      catalogTimer = setTimer(
        () => controller.abort('timeout'),
        requestTimeout,
      );
      try {
        const result = await api.listMissions(controller.signal);
        if (disposed || generation !== catalogGeneration) return;
        if (controller.signal.aborted)
          throw new Error('Mission catalog request timed out');
        catalog = immutableCopy({
          status: 'ready' as const,
          missions: result.missions,
          fixtureAdvanceEnabled: result.fixtureAdvanceEnabled,
        });
      } catch (error) {
        if (disposed || generation !== catalogGeneration) return;
        catalog = {
          status: 'error',
          missions: [],
          error: controller.signal.aborted
            ? 'Mission catalog request timed out.'
            : error instanceof Error
              ? error.message
              : 'Mission catalog unavailable.',
        };
      } finally {
        if (!disposed && generation === catalogGeneration) {
          if (catalogTimer !== undefined) clearTimer(catalogTimer);
          catalogTimer = undefined;
          catalogAbort = undefined;
          publish();
        }
      }
    },
    loadMission(missionId: string) {
      if (disposed || !missionId || missionId === session.getState().missionId)
        return;
      scenarios.leave();
      missionGeneration++;
      interactive.setMission(undefined);
      cancelCatalog();
      cancelAdvance();
      cancelTransport();
      reconnectAttempts = 0;
      history.clear();
      observed.clear();
      session.setState(initialSession(missionId), true);
      world.setState({ connection: 'connecting' }, true);
      connect();
    },
    unloadMission() {
      if (disposed) return;
      missionGeneration++;
      interactive.setMission(undefined);
      cancelCatalog();
      cancelAdvance();
      cancelTransport();
      history.clear();
      observed.clear();
      session.setState(initialSession(), true);
      world.setState({ connection: 'idle' }, true);
      publish();
    },
    retry() {
      if (disposed) return;
      cancelAdvance();
      reconnectAttempts = 0;
      connect();
    },
    selectEntity(id?: string, additive = false) {
      if (disposed) return;
      if (scenarios.get().active) {
        owner.selectScenarioUnit(id, additive);
        return;
      }
      const current = session.getState();
      const frame = snapshot.presentation.frame;
      if (
        id !== undefined &&
        (!frame || !Object.hasOwn(frame.entities, id)) &&
        !(additive && current.selection.items.some((i) => i.id === id))
      )
        return;
      if (
        !additive &&
        current.selection.primary?.id === id &&
        current.selection.items.length <= 1
      )
        return;
      const ref = id ? { kind: 'entity' as const, id } : undefined;
      const items =
        additive && ref
          ? current.selection.items.some(
              (i) => i.kind === 'entity' && i.id === id,
            )
            ? current.selection.items.filter((i) => i.id !== id)
            : [...current.selection.items, ref]
          : ref
            ? [ref]
            : [];
      session.setState({
        selection: {
          missionId: current.missionId,
          items,
          primary: additive
            ? (items.find((i) => i.id === current.selection.primary?.id) ??
              items[0])
            : ref,
          revision: current.selection.revision + 1,
        },
      });
      publish();
    },
    selectEntities(ids: string[], additive = false) {
      if (disposed) return;
      if (scenarios.get().active) {
        owner.selectScenarioUnits(ids, additive);
        return;
      }
      const current = session.getState(),
        frame = snapshot.presentation.frame;
      const unique = [...new Set(ids)].filter((id) => !!frame?.entities[id]);
      const items = additive ? [...current.selection.items] : [];
      for (const id of unique)
        if (!items.some((i) => i.kind === 'entity' && i.id === id))
          items.push({ kind: 'entity', id });
      session.setState({
        selection: {
          missionId: current.missionId,
          items,
          primary: additive
            ? (items.find((i) => i.id === current.selection.primary?.id) ??
              items[0])
            : items[0],
          revision: current.selection.revision + 1,
        },
      });
      publish();
    },
    setFilters(update: Partial<FilterState>) {
      if (disposed) return;
      session.setState({
        filters: immutableCopy({ ...session.getState().filters, ...update }),
      });
      publish();
    },
    setZonesVisible(zones: boolean) {
      if (disposed) return;
      session.setState({ overlays: { ...session.getState().overlays, zones } });
      publish();
    },
    resetFilters() {
      if (disposed) return;
      session.setState({ filters: initialSession().filters });
      publish();
    },
    setHistoryVisible(visible: boolean) {
      if (disposed) return;
      session.setState({
        overlays: {
          ...session.getState().overlays,
          history: visible,
          historyWindowSeconds: 60,
        },
      });
      publish();
    },
    setDisplayPreferences(update: Partial<DisplayPreferences>) {
      if (disposed) return;
      display.update(update);
      publish();
    },
    resetDisplayPreferences() {
      if (disposed) return;
      display.update({}, true);
      publish();
    },
    setBrowserMode(mode: 'all' | 'fleet') {
      browserMode = mode;
      publish();
    },
    refreshInteractive: () => interactive.refresh(),
    newDemo: () => interactive.newDemo(),
    enterAuthoring() {
      if (
        disposed ||
        interactive.get().startingDemo ||
        interactive.get().pending
      )
        return;
      owner.unloadMission();
      liveBoundaries.disarmBoundary();
      scenarios.enter();
      if (scenarios.get().edit)
        owner.selectScenarioUnit(scenarios.get().edit!.id);
    },
    newScenario() {
      if (scenarios.get().edit) {
        scenarios.report('Apply or discard selected unit edits first.');
        return;
      }
      owner.enterAuthoring();
      if (scenarios.get().active) scenarios.newDraft();
    },
    loadScenario: (id: string) => scenarios.load(id),
    refreshScenarios: () => scenarios.refresh(),
    async openSavedScenario(id: string, discard = false) {
      const s = scenarios.get();
      if (
        s.edit ||
        s.actionEdit ||
        s.boundaryEdit ||
        s.pending ||
        s.busy ||
        s.blocked ||
        interactive.get().pending ||
        interactive.get().startingDemo
      ) {
        scenarios.report(
          'Finish the current edit or reconcile its pending request before loading another saved scenario.',
        );
        return false;
      }
      if (s.dirty && !discard) {
        scenarios.report(
          'Save or explicitly discard your unsaved arrangement before loading another.',
        );
        return false;
      }
      owner.enterAuthoring();
      if (!scenarios.get().active) return false;
      await scenarios.load(id);
      owner.selectScenarioUnit();
      return (
        scenarios.get().saved?.definitionId === id && !scenarios.get().error
      );
    },
    updateScenario: (content: ScenarioContent) => scenarios.update(content),
    editScenarioUnit: (edit: ScenarioUnitEdit) => scenarios.editUnit(edit),
    applyScenarioUnitEdit: () => scenarios.applyEdit(),
    discardScenarioUnitEdit: () => scenarios.discardEdit(),
    async saveScenario(asNew = false) {
      await scenarios.save(asNew);
      const id = session.getState().selection.primary?.id;
      if (id && !scenarios.get().draft.units.some((u) => u.id === id))
        owner.selectScenarioUnit();
    },
    async reconcileScenario(retry = false) {
      await scenarios.reconcile(retry);
      const id = session.getState().selection.primary?.id;
      if (id && !scenarios.get().draft.units.some((u) => u.id === id))
        owner.selectScenarioUnit();
    },
    beginAction: scenarios.beginAction,
    beginActionBatch: scenarios.beginBatch,
    setPlanPresentation: scenarios.setPlanPresentation,
    editAction: scenarios.editAction,
    applyAction: scenarios.applyAction,
    cancelAction: scenarios.cancelAction,
    snapActionTime: scenarios.snapActionTime,
    armAction: scenarios.armAction,
    disarmAction: scenarios.disarmAction,
    actionDestination: scenarios.actionDestination,
    selectAction: scenarios.selectAction,
    deleteAction: scenarios.deleteAction,
    reorderAction: scenarios.reorderAction,
    beginBoundary(viewId: string, id?: string) {
      if (
        !scenarios.get().active &&
        !snapshot.presentation.frame &&
        !interactive.get().entry?.activeMissionId
      )
        owner.enterAuthoring();
      owner.armDirectMove();
      owner.pickDestination();
      boundaryOwner().beginBoundary(viewId, id);
    },
    editBoundary: (...args: Parameters<typeof scenarios.editBoundary>) =>
      boundaryOwner().editBoundary(...args),
    disarmBoundary: (viewId?: string) => boundaryOwner().disarmBoundary(viewId),
    cancelBoundary: () => boundaryOwner().cancelBoundary(),
    boundaryPoint: (...args: Parameters<typeof scenarios.boundaryPoint>) =>
      boundaryOwner().boundaryPoint(...args),
    removeBoundaryVertex: (index?: number) =>
      boundaryOwner().removeBoundaryVertex(index),
    applyBoundary: () => boundaryOwner().applyBoundary(),
    setBoundaryType: (...args: Parameters<typeof scenarios.setBoundaryType>) =>
      boundaryOwner().setBoundaryType(...args),
    deleteBoundary: (id: string) => boundaryOwner().deleteBoundary(id),
    boundaryContext: (...args: Parameters<typeof scenarios.boundaryContext>) =>
      boundaryOwner().boundaryContext(...args),
    closeBoundaryMenu: () => boundaryOwner().closeBoundaryMenu(),
    openLiveBoundaries: liveBoundaries.open,
    closeLiveBoundaries: liveBoundaries.close,
    refreshLiveBoundaryRevision: liveBoundaries.refreshRevision,
    selectBoundary(id?: string) {
      if (
        !scenarios.get().active ||
        scenarios.get().edit ||
        scenarios.get().boundaryEdit ||
        scenarios.get().actionEdit
      )
        return;
      const ref = id ? { kind: 'scenario-boundary' as const, id } : undefined;
      session.setState({
        selection: {
          items: ref ? [ref] : [],
          primary: ref,
          revision: session.getState().selection.revision + 1,
        },
      });
      publish();
    },
    validateScenario: () => scenarios.validate(),
    reportScenarioError: (message: string) => scenarios.report(message),
    locateScenarioUnit: (id: string, viewId: string) =>
      scenarios.locate(id, viewId),
    completeScenarioLocate: (serial: number) =>
      scenarios.completeLocate(serial),
    armPlacement(placement?: ScenarioState['placement']) {
      if (scenarios.get().active)
        scenarios.arm(
          placement
            ? { ...placement, viewId: placement.viewId ?? 'tactical' }
            : undefined,
        );
    },
    selectScenarioUnit(id?: string, additive = false) {
      const current = session
        .getState()
        .selection.items.filter((i) => i.kind === 'scenario-unit')
        .map((i) => i.id);
      owner.selectScenarioUnits(
        id
          ? additive
            ? current.includes(id)
              ? current.filter((x) => x !== id)
              : [...current, id]
            : [id]
          : [],
      );
    },
    selectScenarioUnits(ids: string[], additive = false) {
      const id = ids[0];
      if (scenarios.get().boundaryEdit || scenarios.get().actionEdit) return;
      if (scenarios.get().edit && scenarios.get().edit!.id !== id) {
        scenarios.report(
          'Apply or discard selected unit edits before changing selection.',
        );
        return;
      }
      if (
        !scenarios.get().active ||
        (id && !scenarios.get().draft.units.some((u) => u.id === id))
      )
        return;
      const units = scenarios.get().draft.units;
      const previous = additive
        ? session
            .getState()
            .selection.items.filter((i) => i.kind === 'scenario-unit')
            .map((i) => i.id)
        : [];
      const valid = [...new Set([...previous, ...ids])].filter((id) =>
        units.some((u) => u.id === id),
      );
      const category = units.find((u) => u.id === valid[0])?.category;
      if (
        valid.some(
          (id) => units.find((u) => u.id === id)?.category !== category,
        )
      ) {
        scenarios.report(
          'Select actors from one category for group authoring.',
        );
        return;
      }
      const items = valid.map((id) => ({ kind: 'scenario-unit' as const, id }));
      const ref = items[0];
      session.setState({
        selection: {
          items,
          primary: ref,
          revision: session.getState().selection.revision + 1,
        },
      });
      publish();
    },
    placeScenarioUnit(
      longitudeDeg: number,
      latitudeDeg: number,
      pose?: {
        altitude: number;
        heading: number;
        commandRole: UnitPlacement['commandRole'];
      },
    ) {
      const state = scenarios.get(),
        placement = state.placement;
      if (
        !state.active ||
        !placement ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.busy ||
        state.pending
      )
        return;
      if (!withinScenarioExtent(longitudeDeg, latitudeDeg)) {
        scenarios.report(
          'Place units within 5 km of the local origin. Recenter to return.',
        );
        return;
      }
      const draft = structuredClone(state.draft) as ScenarioContent;
      const source = draft.units.find((u) => u.id === placement.duplicateId);
      if (
        placement.duplicateId &&
        (!source ||
          (source.position.longitudeDeg === longitudeDeg &&
            source.position.latitudeDeg === latitudeDeg))
      ) {
        scenarios.report(
          'Choose a different position for the duplicate. The source unit is unchanged.',
        );
        return false;
      }
      let unit = draft.units.find((u) => u.id === placement.replaceId);
      if (unit) unit.position = { ...unit.position, longitudeDeg, latitudeDeg };
      else {
        if (draft.units.length >= 32) {
          scenarios.report('This demo supports up to 32 units.');
          return;
        }
        unit = {
          ...source,
          id: crypto.randomUUID(),
          label: source
            ? `${source.label.slice(0, 59)} copy`
            : `${placement.category === 'friendly' ? 'Friendly' : placement.category === 'hostile' ? 'Hostile' : 'Unknown'} ${draft.units.length + 1}`,
          category: placement.category,
          ...(source?.profileId || placement.profileId
            ? { profileId: source?.profileId ?? placement.profileId }
            : {}),
          commandRole:
            source?.commandRole ??
            (placement.category === 'friendly' ? 'sentinel' : 'observation'),
          position: {
            longitudeDeg,
            latitudeDeg,
            altitude: {
              metres: source?.position.altitude.metres ?? 150,
              reference: 'ELLIPSOID',
              datumId: 'WGS84',
            },
          },
          headingTrueDeg: source?.headingTrueDeg ?? 0,
        } as UnitPlacement;
        draft.units.push(unit);
      }
      if (pose) {
        unit.position.altitude.metres = pose.altitude;
        unit.headingTrueDeg = pose.heading;
        unit.commandRole = pose.commandRole;
      }
      try {
        decodeScenarioWrite({
          requestId: 'placement',
          expectedRevision: 0,
          content: draft,
        });
      } catch {
        scenarios.report(
          'Check placement: finite coordinates within the local area, height 0–5000 m, heading below 360°, and a supported command role.',
        );
        return false;
      }
      scenarios.update(draft);
      scenarios.arm();
      owner.selectScenarioUnit(unit.id);
      return true;
    },
    async runScenario() {
      const state = scenarios.get();
      if (
        !state.saved ||
        !state.active ||
        state.edit ||
        state.actionEdit ||
        state.boundaryEdit ||
        state.blocked ||
        state.dirty ||
        state.pending ||
        state.busy ||
        state.placement ||
        !state.review?.canRun ||
        !state.draft.units.length
      )
        return;
      const { definitionId, revision, contentHash } = state.saved;
      await interactive.newDemo({ definitionId, revision, contentHash });
    },
    armDirectMove(viewId?: string) {
      session.setState({ directDestinationView: viewId });
      publish();
    },
    async directMove(longitude: number, latitude: number) {
      // Capture before any asynchronous step. Later selection changes cannot retarget it.
      session.setState({ directDestinationView: undefined });
      try {
        const intent = captureDirectMove(snapshot, longitude, latitude);
        const mode = interceptSelection(snapshot);
        const rts =
          snapshot.presentation.frame?.fleetBehavior?.ruleVersion ===
          'local-fleet-v2';
        if (mode.mixed && !rts)
          throw new Error(
            'Mixed behaviors. Apply Intercept or Hold / Manual to the selection first.',
          );
        if (mode.armed && !rts) intent.intercept = true;
        publish();
        await interactive.submitDirect(intent);
      } catch (e) {
        interactive.rejectDirect(
          longitude,
          latitude,
          e instanceof Error ? e.message : 'Destination unavailable.',
        );
      }
    },
    selectedControl: (action: 'stop' | 'return-to-script') => {
      try {
        return interactive.selectedControl(
          action,
          captureScriptControl(snapshot),
        );
      } catch (error) {
        interactive.reportControlError(
          error instanceof Error ? error.message : 'Control unavailable.',
        );
      }
    },
    applyBehavior: (kind: BehaviorPolicy['kind'], boundaryId?: string) => {
      try {
        const { members, policy } = captureBehavior(snapshot, kind, boundaryId);
        return interactive.applyBehavior(members, policy);
      } catch (error) {
        interactive.reportControlError(
          error instanceof Error ? error.message : 'Behavior unavailable.',
        );
      }
    },
    interactiveAction: (action: Action | 'create') =>
      interactive.perform(action),
    reconcileInteractive: (resend = false) => interactive.reconcile(resend),
    beginMove(replace = false) {
      if (interactive.get().pending || interactive.get().busy) return;
      if (session.getState().movementDraft && !replace) return;
      session.setState({
        movementDraft: captureMovement(snapshot),
        destinationPickView: undefined,
      });
      publish();
    },
    editMove(coordinate: 'longitude' | 'latitude', value: string) {
      const draft = session.getState().movementDraft;
      if (!draft || draft.phase === 'submitted') return;
      session.setState({
        movementDraft: {
          ...draft,
          [coordinate]: value,
          phase: 'editing',
          intent: undefined,
          error: undefined,
        },
      });
      publish();
    },
    reviewMove() {
      const draft = session.getState().movementDraft;
      if (!draft || draft.phase === 'submitted') return;
      try {
        session.setState({
          movementDraft: {
            ...draft,
            intent: reviewMovement(draft),
            phase: 'reviewed',
            error: undefined,
          },
          destinationPickView: undefined,
        });
      } catch (e) {
        session.setState({
          movementDraft: {
            ...draft,
            error: e instanceof Error ? e.message : 'Invalid destination.',
          },
        });
      }
      publish();
    },
    discardMove() {
      session.setState({
        movementDraft: undefined,
        destinationPickView: undefined,
      });
      publish();
    },
    pickDestination(viewId?: string) {
      session.setState({ destinationPickView: viewId });
      publish();
    },
    setDestination(longitude: number, latitude: number) {
      const draft = session.getState().movementDraft;
      if (!draft || draft.phase === 'submitted') return;
      session.setState({
        movementDraft: {
          ...draft,
          longitude: longitude.toFixed(9),
          latitude: latitude.toFixed(9),
          phase: 'editing',
          intent: undefined,
          error: undefined,
        },
      });
      publish();
    },
    async submitMove() {
      if (draftReason(snapshot)) return;
      const draft = session.getState().movementDraft!,
        requestId = crypto.randomUUID();
      session.setState({
        movementDraft: { ...draft, phase: 'submitted', requestId },
        destinationPickView: undefined,
      });
      publish();
      await interactive.submitMove(draft.intent!, requestId);
    },
    cancelExecution: (id: string) => interactive.perform('cancel', id),
    retryHistory() {
      if (!disposed) {
        observed.retry();
        publish();
      }
    },
    async advanceFixture() {
      const frame = world.getState().live;
      if (
        disposed ||
        advancing ||
        !frame ||
        world.getState().connection !== 'connected' ||
        !catalog.fixtureAdvanceEnabled ||
        !frame.mission.extensions?.['sentinel.fixture']
      )
        return;
      const generation = missionGeneration;
      const requestGeneration = ++advanceGeneration;
      const controller = new AbortController();
      advanceAbort = controller;
      advancing = true;
      advanceError = undefined;
      publish();
      advanceTimer = setTimer(
        () => controller.abort('timeout'),
        requestTimeout,
      );
      try {
        const ack = await api.advanceFixture(
          frame.mission.id,
          frame.sequence,
          controller.signal,
        );
        if (controller.signal.aborted)
          throw new Error('Fixture request timed out');
        if (ack.mission.id !== frame.mission.id)
          throw new Error('Fixture acknowledgement mission mismatch');
      } catch (error) {
        if (
          disposed ||
          generation !== missionGeneration ||
          requestGeneration !== advanceGeneration
        )
          return;
        advanceError = controller.signal.aborted
          ? 'Fixture request timed out. Check the committed frame before retrying.'
          : error instanceof Error
            ? error.message
            : 'Fixture update failed.';
      } finally {
        if (
          !disposed &&
          generation === missionGeneration &&
          requestGeneration === advanceGeneration
        ) {
          if (advanceTimer !== undefined) clearTimer(advanceTimer);
          advanceTimer = undefined;
          advanceAbort = undefined;
          advancing = false;
          publish();
        }
      }
    },
    dispose() {
      motion.dispose();
      if (disposed) return;
      disposed = true;
      interactive.dispose();
      scenarios.dispose();
      missionGeneration++;
      interactive.setMission(undefined);
      cancelCatalog();
      cancelAdvance();
      cancelTransport();
      listeners.clear();
      history.clear();
      observed.clear();
    },
  };
  interactive.start();
  return owner;
}

export type ApplicationRuntime = ReturnType<typeof createRuntime>;
