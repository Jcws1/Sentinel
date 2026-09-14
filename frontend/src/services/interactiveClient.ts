import type {
  CommandRequest,
  CreateRunRequest,
  DemoEntry,
  Receipt,
  RunRead,
} from '../contracts/generated';
import {
  decodeEntry,
  decodeIntent,
  decodeReceipt,
  decodeRunRead,
} from '../contracts/interactive';
import type { Fetcher } from './api';
import { immutableCopy } from '../world/immutable';
import type { DeepReadonly } from '../contracts/types';

export type Action = CommandRequest['intent']['action'];
type Pending = { missionId?: string; body: CommandRequest | CreateRunRequest };
export interface InteractiveState {
  entry?: DeepReadonly<DemoEntry>;
  current?: DeepReadonly<RunRead>;
  pending?: DeepReadonly<Pending>;
  busy: boolean;
  error?: string;
  receipt?: DeepReadonly<Receipt>;
  holderId: string;
}
const pendingKey = 'sentinel.interactive.pending.v1';
const privateKey = 'sentinel.interactive.private.v1';
export interface PrivateSession {
  holderId: string;
  credential: string;
}

/** One shared session owner. Credentials never enter its public snapshot. */
export function createInteractiveClient(options: {
  base: string;
  fetcher: Fetcher;
  publish: () => void;
  loadMission: (id: string) => void;
  storage?: Storage;
  timeoutMs?: number;
}) {
  let storage: Storage | undefined;
  try {
    storage = options.storage ?? globalThis.sessionStorage;
  } catch {
    /* Report before sending. */
  }
  let privateSession: PrivateSession | undefined;
  let pending: Pending | undefined;
  let error: string | undefined;
  try {
    const saved = storage?.getItem(privateKey);
    if (saved) privateSession = JSON.parse(saved) as PrivateSession;
    const savedPending = storage?.getItem(pendingKey);
    if (savedPending) {
      pending = JSON.parse(savedPending) as Pending;
      error = 'Outcome unknown after reload. Reconcile the saved request.';
    }
  } catch {
    error =
      'Saved session could not be read. Requests are blocked until session storage is available.';
  }
  let state: InteractiveState = {
    holderId: privateSession?.holderId ?? 'This local session',
    pending,
    busy: false,
    error,
  };
  let missionId: string | undefined,
    generation = 0,
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  let polling = false;
  const emit = (update: Partial<InteractiveState>) => {
    state = { ...state, ...update };
    options.publish();
  };
  function identity() {
    if (!storage)
      throw new Error(
        'Session storage is unavailable; request identity cannot be saved.',
      );
    if (!privateSession) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      privateSession = {
        holderId: `Operator ${crypto.randomUUID().slice(0, 8)}`,
        credential: Array.from(bytes, (n) =>
          n.toString(16).padStart(2, '0'),
        ).join(''),
      };
      storage.setItem(privateKey, JSON.stringify(privateSession));
      emit({ holderId: privateSession.holderId });
    }
    // Prove storage is writable before any command is sent.
    storage.setItem(privateKey, JSON.stringify(privateSession));
    return privateSession;
  }
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    control = false,
  ) {
    const controller = new AbortController();
    if (method === 'POST') abort = controller;
    const deadline = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 10_000,
    );
    try {
      const response = await options.fetcher(
        `${options.base}/interactive${path}`,
        {
          method,
          signal: controller.signal,
          headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(control && privateSession
              ? { 'X-Sentinel-Control': privateSession.credential }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (!response.ok) {
        // Fixed backend messages contain no request or credential echo.
        const value = (await response.json()) as {
          code?: string;
          message?: string;
        };
        throw Object.assign(
          new Error(
            value.message ?? `Backend unavailable (${response.status})`,
          ),
          { status: response.status },
        );
      }
      if (controller.signal.aborted) throw new Error('Request timed out');
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(deadline);
      if (abort === controller) abort = undefined;
    }
  }
  async function refresh() {
    if (disposed || polling) return;
    polling = true;
    const gen = generation,
      mid = missionId;
    try {
      const entry = decodeEntry(await request('/entry'));
      const current = mid
        ? decodeRunRead(
            await request(
              `/${encodeURIComponent(mid)}/status`,
              'GET',
              undefined,
              true,
            ),
          )
        : undefined;
      if (current && current.run.missionId !== mid)
        throw new Error('Run status mission mismatch');
      if (!disposed && gen === generation)
        emit({
          entry,
          current,
          error:
            pending || state.receipt?.accepted === false
              ? state.error
              : undefined,
        });
    } catch (e) {
      if (!disposed && gen === generation)
        emit({
          current: undefined,
          error: e instanceof Error ? e.message : 'Run status unavailable.',
        });
    } finally {
      polling = false;
    }
  }
  function remember(value: Pending) {
    identity();
    storage!.setItem(pendingKey, JSON.stringify(value));
    pending = value;
    emit({ pending, error: undefined, receipt: undefined });
  }
  async function accept(value: unknown, sent: Pending, gen: number) {
    const receipt = decodeReceipt(value);
    const id =
      'creationId' in sent.body ? sent.body.creationId : sent.body.commandId;
    if (
      receipt.requestId !== id ||
      (sent.missionId && receipt.missionId !== sent.missionId)
    )
      throw new Error('Receipt identity mismatch');
    if (disposed || gen !== generation) return;
    storage!.removeItem(pendingKey);
    pending = undefined;
    emit({
      pending: undefined,
      receipt,
      error: receipt.accepted
        ? undefined
        : `${receipt.code}: ${receipt.message}`,
    });
    if (receipt.accepted && receipt.operation === 'create')
      options.loadMission(receipt.missionId!);
    await refresh();
  }
  async function transmit(sent: Pending, gen: number) {
    await accept(
      await request(
        sent.missionId
          ? `/${encodeURIComponent(sent.missionId)}/commands`
          : '/runs',
        'POST',
        sent.body,
        !!sent.missionId,
      ),
      sent,
      gen,
    );
  }
  async function perform(action: Action | 'create') {
    if (disposed || state.busy || pending) return;
    const gen = generation,
      mid = missionId;
    emit({ busy: true, error: undefined });
    try {
      const session = identity();
      if (action === 'create') {
        remember({
          body: {
            creationId: crypto.randomUUID(),
            templateId: 'singapore-local-v1',
          },
        });
      } else {
        if (!mid) throw new Error('Load a local demo run.');
        const intent = decodeIntent(
          await request(`/${encodeURIComponent(mid)}/intents`, 'POST', {
            action,
          }),
        );
        if (disposed || gen !== generation) return;
        if (intent.missionId !== mid || intent.action !== action)
          throw new Error('Intent context mismatch');
        remember({
          missionId: mid,
          body: {
            commandId: crypto.randomUUID(),
            holderId: session.holderId,
            intent,
          },
        });
      }
      await transmit(pending!, gen);
    } catch (e) {
      if (!disposed && gen === generation)
        emit({
          error: pending
            ? 'Outcome unknown. Reconcile or retry this saved request; its identity will be retained.'
            : e instanceof Error
              ? e.message
              : 'Action unavailable.',
        });
    } finally {
      if (!disposed && gen === generation) emit({ busy: false });
    }
  }
  async function reconcile(resend = false) {
    if (!pending || state.busy || disposed) return;
    const saved = pending,
      gen = generation;
    emit({ busy: true });
    try {
      if (resend) await transmit(saved, gen);
      else {
        const path = saved.missionId
          ? `/${encodeURIComponent(saved.missionId)}/receipts?identity=${encodeURIComponent((saved.body as CommandRequest).commandId)}`
          : `/creations?identity=${encodeURIComponent((saved.body as CreateRunRequest).creationId)}`;
        await accept(await request(path), saved, gen);
      }
    } catch (e) {
      if (!disposed && gen === generation)
        emit({
          error:
            (e as { status?: number }).status === 404
              ? 'No committed receipt yet. Retry the saved request with its original identity.'
              : e instanceof Error
                ? e.message
                : 'Outcome remains unknown.',
        });
    } finally {
      if (!disposed && gen === generation) emit({ busy: false });
    }
  }
  async function poll() {
    await refresh();
    const current = state.current;
    if (
      !disposed &&
      current?.ownsControl &&
      current.run.state !== 'ended' &&
      !pending &&
      !state.busy &&
      Date.parse(current.run.lease.expiresAt!) -
        Date.parse(current.serverTime) <=
        20_000
    )
      await perform('renew');
    if (!disposed)
      timer = setTimeout(() => {
        void poll();
      }, 5_000);
  }
  return {
    get: () => immutableCopy(state),
    perform,
    reconcile,
    refresh,
    setMission(mid?: string) {
      if (missionId === mid) return;
      generation++;
      abort?.abort();
      missionId = mid;
      emit({
        current: undefined,
        busy: false,
        receipt: undefined,
        error: pending ? 'A saved request needs reconciliation.' : undefined,
      });
      void refresh();
    },
    start() {
      if (!timer)
        timer = setTimeout(() => {
          void poll();
        }, 0);
    },
    dispose() {
      disposed = true;
      generation++;
      abort?.abort();
      clearTimeout(timer);
    },
  };
}
