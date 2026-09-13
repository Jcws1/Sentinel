import type { ObservedHistory } from '../contracts/generated';
import type { DeepReadonly, ImmutableFrame } from '../contracts/types';
import { immutableCopy } from './immutable';

export interface ObservedState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: DeepReadonly<ObservedHistory>;
  refreshing?: boolean;
  error?: string;
}
export type HistoryLoader = (
  missionId: string,
  entityId: string,
  frameId: string,
  windowSeconds: number,
  signal: AbortSignal,
) => Promise<ObservedHistory>;
type Demand = {
  frame: ImmutableFrame;
  entityId: string;
  seconds: number;
  key: string;
  identity: string;
};

/** Older immutable series may remain while refreshing only when no future or
 * foreign data can escape. The UI discloses the exact returned through time. */
export function historyFitsFrame(
  data: DeepReadonly<ObservedHistory>,
  frame: ImmutableFrame,
) {
  return (
    data.missionId === frame.mission.id &&
    data.recordingId === frame.recordingId &&
    data.streamEpoch === frame.streamEpoch &&
    data.throughSequence <= frame.sequence &&
    (data.throughSequence !== frame.sequence ||
      data.throughFrameId === frame.frameId) &&
    data.throughAt <= frame.effectiveAt &&
    Date.parse(frame.effectiveAt) - Date.parse(data.throughAt) <
      data.windowSeconds * 1000
  );
}
/** One owner, eight immutable entries, one request plus the latest demand.
 * Frames coalesce instead of perpetually aborting a slow read. Mission, selection,
 * epoch and window changes cancel immediately. Failures require explicit retry. */
export function createObservedHistory(
  loader: HistoryLoader,
  changed: () => void,
  timeoutMs = 10000,
) {
  const cache = new Map<string, DeepReadonly<ObservedHistory>>();
  let state: ObservedState = { status: 'idle' };
  let desired: Demand | undefined;
  let generation = 0,
    failed = false;
  let request: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    generation++;
    request?.abort();
    request = undefined;
    clearTimeout(timer);
    timer = undefined;
  }
  function ensure() {
    if (!desired || request || failed) return;
    const target = desired,
      cached = cache.get(target.key);
    if (cached) {
      cache.delete(target.key);
      cache.set(target.key, cached);
      state = { status: 'ready', data: cached };
      return;
    }
    const controller = new AbortController(),
      token = generation;
    request = controller;
    state = state.data
      ? { status: 'ready', data: state.data, refreshing: true }
      : { status: 'loading' };
    timer = setTimeout(() => {
      if (token !== generation) return;
      cancel();
      failed = true;
      state = { status: 'error', error: 'Observed history timed out.' };
      changed();
    }, timeoutMs);
    void loader(
      target.frame.mission.id,
      target.entityId,
      target.frame.frameId,
      target.seconds,
      controller.signal,
    )
      .then((data) => {
        if (token !== generation) return;
        const frame = target.frame;
        if (
          data.missionId !== frame.mission.id ||
          data.entityId !== target.entityId ||
          data.recordingId !== frame.recordingId ||
          data.streamEpoch !== frame.streamEpoch ||
          data.throughFrameId !== frame.frameId ||
          data.throughSequence !== frame.sequence ||
          data.throughAt !== frame.effectiveAt ||
          data.windowSeconds !== target.seconds
        )
          throw new Error('Observed history anchor mismatch');
        const frozen = immutableCopy(data);
        cache.set(target.key, frozen);
        while (cache.size > 8) cache.delete(cache.keys().next().value!);
        if (
          desired &&
          historyFitsFrame(frozen, desired.frame) &&
          (!state.data || frozen.throughSequence >= state.data.throughSequence)
        )
          state = { status: 'ready', data: frozen };
      })
      .catch((error) => {
        if (token !== generation) return;
        failed = true;
        state = {
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Observed history unavailable.',
        };
      })
      .finally(() => {
        if (token !== generation) return;
        clearTimeout(timer);
        timer = undefined;
        request = undefined;
        ensure();
        changed();
      });
  }
  return {
    get: () => state,
    sync(
      frame: ImmutableFrame | undefined,
      entityId: string | undefined,
      enabled: boolean,
      seconds = 60,
    ) {
      const next =
        enabled && frame && entityId
          ? {
              frame,
              entityId,
              seconds,
              identity: JSON.stringify([
                frame.mission.id,
                frame.recordingId,
                frame.streamEpoch,
                entityId,
                seconds,
              ]),
              key: JSON.stringify([
                frame.mission.id,
                frame.recordingId,
                frame.streamEpoch,
                frame.frameId,
                entityId,
                seconds,
              ]),
            }
          : undefined;
      if (next?.identity !== desired?.identity) {
        cancel();
        failed = false;
        state = { status: 'idle' };
      }
      desired = next;
      if (!next) {
        state = { status: 'idle' };
        return;
      }
      if (state.data && !historyFitsFrame(state.data, next.frame))
        state = { status: 'loading' };
      ensure();
    },
    retry() {
      cancel();
      failed = false;
      if (desired) cache.delete(desired.key);
      state = { status: 'idle' };
    },
    clear() {
      cancel();
      desired = undefined;
      cache.clear();
      failed = false;
      state = { status: 'idle' };
    },
  };
}
