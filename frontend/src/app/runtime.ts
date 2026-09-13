import { decodeStream } from '../contracts/decode';
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
}
export interface RuntimeDependencies {
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
  const observed = createObservedHistory(
    api.observedHistory,
    publish,
    requestTimeout,
  );

  function publish() {
    const cache = world.getState();
    const operational = session.getState();
    const presentation = derivePresentation(cache, operational, history);
    observed.sync(
      presentation.frame,
      operational.selection.primary?.kind === 'entity'
        ? operational.selection.primary.id
        : undefined,
      !!operational.overlays.history,
      operational.overlays.historyWindowSeconds ?? 60,
    );
    snapshot = Object.freeze({
      catalog: immutableCopy(catalog),
      connection: cache.connection,
      error: cache.error,
      missionId: operational.missionId,
      presentation: Object.freeze(presentation),
      observed: observed.get(),
      session: immutableCopy(operational),
      advancing,
      advanceError,
    });
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
  return {
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
      missionGeneration++;
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
    selectEntity(id?: string) {
      if (disposed) return;
      const current = session.getState();
      const frame = snapshot.presentation.frame;
      if (id !== undefined && (!frame || !Object.hasOwn(frame.entities, id)))
        return;
      if (
        current.selection.primary?.id === id &&
        current.selection.items.length <= 1
      )
        return;
      const ref = id ? { kind: 'entity' as const, id } : undefined;
      session.setState({
        selection: {
          missionId: current.missionId,
          items: ref ? [ref] : [],
          primary: ref,
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
      if (disposed) return;
      disposed = true;
      missionGeneration++;
      cancelCatalog();
      cancelAdvance();
      cancelTransport();
      listeners.clear();
      history.clear();
      observed.clear();
    },
  };
}

export type ApplicationRuntime = ReturnType<typeof createRuntime>;
