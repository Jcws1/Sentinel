import type {
  ScenarioRef,
  CommandRequest,
  CreateRunRequest,
  DemoEntry,
  Receipt,
  RunRead,
  LegacyReceipt,
  LegacyM12Receipt,
  LegacyD2Receipt,
  LegacyD3Receipt,
  LegacyD3AReceipt,
  LegacyD4Receipt,
  BehaviorPolicy,
  BoundaryMutation,
  DirectMoveMember,
  MoveIntent,
  MoveRequest,
  DirectMoveIntent,
  DirectMoveRequest,
  RecommendationSet,
  RecommendationOption,
} from '../contracts/generated';
import {
  decodeEntry,
  decodeIntent,
  decodeRecommendations,
  decodeReceipt,
  decodeRunRead,
  decodeDirectMoveRequest,
} from '../contracts/interactive';
import type { Fetcher } from './api';
import { immutableCopy } from '../world/immutable';
import type { DeepReadonly } from '../contracts/types';

export type Action = CommandRequest['intent']['action'];
type Pending = {
  missionId?: string;
  body: CommandRequest | CreateRunRequest | MoveRequest;
};
export type DirectPending = { missionId: string; body: DirectMoveRequest };
export interface DirectFeedback {
  acknowledgedAt?: number;
  id: string;
  longitudeDeg: number;
  latitudeDeg: number;
  stage: 'pending' | 'accepted' | 'rejected';
  message: string;
}
export interface InteractiveState {
  directPending: readonly DirectPending[];
  directReceipt?: DeepReadonly<
    | Receipt
    | LegacyD4Receipt
    | LegacyD3AReceipt
    | LegacyD3Receipt
    | LegacyD2Receipt
  >;
  directReceipts: readonly DeepReadonly<
    | Receipt
    | LegacyD4Receipt
    | LegacyD3AReceipt
    | LegacyD3Receipt
    | LegacyD2Receipt
  >[];
  directFeedback?: DirectFeedback;
  startingDemo: boolean;
  entry?: DeepReadonly<DemoEntry>;
  current?: DeepReadonly<RunRead>;
  pending?: DeepReadonly<Pending>;
  busy: boolean;
  error?: string;
  receipt?: DeepReadonly<
    | Receipt
    | LegacyD4Receipt
    | LegacyD3AReceipt
    | LegacyD3Receipt
    | LegacyD2Receipt
    | LegacyReceipt
    | LegacyM12Receipt
  >;
  movementReceipt?: DeepReadonly<
    | Receipt
    | LegacyD4Receipt
    | LegacyD3AReceipt
    | LegacyD3Receipt
    | LegacyD2Receipt
    | LegacyReceipt
    | LegacyM12Receipt
  >;
  now?: string;
  renewing?: boolean;
  holderId: string;
}
const pendingKey = 'sentinel.interactive.pending.v1';
const privateKey = 'sentinel.interactive.private.v1';
const directKey = 'sentinel.interactive.direct.v1';
const orderKey = 'sentinel.interactive.order.v1';
const startupKey = 'sentinel.interactive.startup.v1';
const releaseKey = 'sentinel.interactive.released.v1';
export interface PrivateSession {
  holderId: string;
  credential: string;
}
function canonicalCommand(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalCommand).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalCommand(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
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
  let directPending: DirectPending[] = [];
  let startup: string | undefined;
  let nextOrder = 0;
  let storageFault = false;
  let released: string[] = [];
  try {
    directPending = (
      JSON.parse(storage?.getItem(directKey) ?? '[]') as DirectPending[]
    ).map((p) => {
      const body = decodeDirectMoveRequest(p.body);
      if (p.missionId !== body.direct.missionId)
        throw new Error('Saved movement context mismatch');
      return { missionId: p.missionId, body };
    });
    nextOrder = Number(storage?.getItem(orderKey) ?? 0);
    startup = storage?.getItem(startupKey) ?? undefined;
    released = JSON.parse(storage?.getItem(releaseKey) ?? '[]') as string[];
    const saved = storage?.getItem(privateKey);
    if (saved) privateSession = JSON.parse(saved) as PrivateSession;
    const savedPending = storage?.getItem(pendingKey);
    if (savedPending) {
      pending = JSON.parse(savedPending) as Pending;
      error = 'Outcome unknown after reload. Reconcile the saved request.';
    }
  } catch {
    storageFault = true;
    error =
      'Saved session could not be read. Requests are blocked until session storage is available.';
  }
  let state: InteractiveState = {
    directPending,
    directReceipts: [],
    startingDemo: !!startup,
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
  const advisoryReads = new Set<AbortController>();
  let refreshing: Promise<void> | undefined;
  let refreshQueued = false;
  let managing = false;
  let renewal: Promise<unknown> | undefined;
  let creatingDemo = false;
  const directSending = new Set<string>();
  let latestDirectId: string | undefined;
  let latestDirectOrder = -1;
  let clockAnchor: { iso: string; elapsed: number } | undefined;
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  const emit = (update: Partial<InteractiveState>) => {
    state = { ...state, ...update };
    options.publish();
  };
  function identity() {
    if (storageFault)
      throw new Error('Saved session cannot be decoded; requests are blocked.');
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
    advisory = false,
  ) {
    const controller = new AbortController();
    if (advisory) advisoryReads.add(controller);
    else if (method === 'POST') abort = controller;
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
      advisoryReads.delete(controller);
    }
  }
  function refresh(): Promise<void> {
    if (disposed) return Promise.resolve();
    // A mission/revision change during a read must not wait for the next poll.
    // Coalesce callers into one follow-up read and resolve them only after the
    // queued authority has been read. Generation checks still reject old data.
    refreshQueued = true;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        while (refreshQueued && !disposed) {
          refreshQueued = false;
          await refreshOnce();
        }
      } finally {
        refreshing = undefined;
      }
    })();
    return refreshing;
  }
  async function refreshOnce() {
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
      if (!disposed && gen === generation) {
        if (current)
          clockAnchor = { iso: current.serverTime, elapsed: performance.now() };
        emit({
          entry,
          current,
          now: current?.serverTime,
          error:
            storageFault ||
            pending ||
            state.receipt?.accepted === false ||
            state.directFeedback?.stage === 'rejected'
              ? state.error
              : undefined,
        });
      }
    } catch (e) {
      if (!disposed && gen === generation)
        emit({
          current: undefined,
          error: e instanceof Error ? e.message : 'Run status unavailable.',
        });
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
      receipt.operation !==
        ('creationId' in sent.body
          ? 'create'
          : 'move' in sent.body
            ? 'move'
            : sent.body.intent.action) ||
      (sent.missionId && receipt.missionId !== sent.missionId)
    )
      throw new Error('Receipt identity mismatch');
    if (
      'move' in sent.body &&
      sent.body.order != null &&
      ((receipt.schemaVersion !== '1.5' && receipt.schemaVersion !== '1.6') ||
        receipt.movementOrder !== sent.body.order)
    )
      throw new Error('Reviewed Move receipt order mismatch');
    if (
      'intent' in sent.body &&
      ['stop', 'return-to-script'].includes(sent.body.intent.action)
    ) {
      const intent = sent.body.intent;
      if (
        (receipt.schemaVersion !== '1.3' &&
          receipt.schemaVersion !== '1.4' &&
          receipt.schemaVersion !== '1.5' &&
          receipt.schemaVersion !== '1.6') ||
        receipt.controlOrder !== intent.order
      )
        throw new Error('Selected control receipt order mismatch');
      const outcomes = receipt.controlOutcomes ?? [];
      if (
        (receipt.accepted && outcomes.length !== intent.members?.length) ||
        outcomes.some(
          (o) =>
            !intent.members?.some(
              (m) => m.assetId === o.assetId && m.entityId === o.entityId,
            ),
        )
      )
        throw new Error('Selected control receipt membership mismatch');
    }
    if ('intent' in sent.body && sent.body.intent.action === 'behavior') {
      const intent = sent.body.intent;
      if (
        (receipt.schemaVersion !== '1.5' && receipt.schemaVersion !== '1.6') ||
        receipt.behaviorOrder !== intent.order
      )
        throw new Error('Behavior receipt order mismatch');
      const outcomes = receipt.behaviorOutcomes ?? [];
      if (
        (receipt.accepted && outcomes.length !== intent.members?.length) ||
        outcomes.some(
          (o) =>
            !intent.members?.some(
              (m) => m.assetId === o.assetId && m.entityId === o.entityId,
            ),
        )
      )
        throw new Error('Behavior receipt membership mismatch');
    }
    if (disposed || gen !== generation) return;
    if (receipt.accepted && sent.missionId) {
      if (receipt.operation === 'revoke')
        released = [...new Set([...released, sent.missionId])];
      if (receipt.operation === 'acquire' || receipt.operation === 'reclaim')
        released = released.filter((id) => id !== sent.missionId);
      storage!.setItem(releaseKey, JSON.stringify(released));
    }
    storage!.removeItem(pendingKey);
    pending = undefined;
    emit({
      pending: undefined,
      receipt,
      ...('move' in sent.body ||
      ('intent' in sent.body && sent.body.intent.action === 'cancel')
        ? { movementReceipt: receipt }
        : {}),
      error: receipt.accepted
        ? undefined
        : `${receipt.code}: ${receipt.message}`,
    });
    if (receipt.accepted && receipt.operation === 'create') {
      if (creatingDemo || startup === 'creating') {
        startup = receipt.missionId!;
        storage!.setItem(startupKey, startup);
      }
      options.loadMission(receipt.missionId!);
    }
    await refresh();
  }
  async function transmit(sent: Pending, gen: number) {
    await accept(
      await request(
        sent.missionId
          ? `/${encodeURIComponent(sent.missionId)}/${'move' in sent.body ? 'moves' : 'commands'}`
          : '/runs',
        'POST',
        sent.body,
        !!sent.missionId,
      ),
      sent,
      gen,
    );
  }
  async function perform(
    action: Action | 'create',
    executionId?: string,
    scenario?: ScenarioRef,
    members?: DirectMoveMember[],
    boundary?: BoundaryMutation,
    policy?: BehaviorPolicy,
    recommendation?: {
      set: RecommendationSet;
      option: RecommendationOption;
      current: () => boolean;
    },
  ) {
    if (disposed || state.busy || pending) return;
    const gen = generation,
      mid = missionId;
    emit({ busy: true, error: undefined });
    let submittedId: string | undefined;
    try {
      const session = identity();
      if (action === 'create') {
        remember({
          body: {
            creationId: crypto.randomUUID(),
            ...(scenario
              ? { scenario }
              : { templateId: 'singapore-local-v2' as const }),
          },
        });
      } else {
        if (!mid) throw new Error('Load a local demo run.');
        const selection = members
          ? { members, order: allocateOrder() }
          : undefined;
        const intent = decodeIntent(
          await request(`/${encodeURIComponent(mid)}/intents`, 'POST', {
            action,
            ...(executionId ? { executionId } : {}),
            ...selection,
            ...(boundary ? { boundary } : {}),
            ...(policy ? { policy } : {}),
            ...(recommendation
              ? {
                  recommendation: {
                    recommendationId: recommendation.set.id,
                    optionId: recommendation.option.id,
                  },
                }
              : {}),
          }),
        );
        if (disposed || gen !== generation) return;
        if (recommendation && !recommendation.current())
          throw new Error('Suggestion context changed; refresh.');
        if (recommendation) {
          const {
            id,
            options: reviewedOptions,
            ...context
          } = recommendation.set;
          if (
            !reviewedOptions.some(
              (option) =>
                canonicalCommand(option) ===
                canonicalCommand(recommendation.option),
            )
          )
            throw new Error(
              'Option is not part of the reviewed suggestion set.',
            );
          const expected = {
            ...context,
            recommendationId: id,
            option: recommendation.option,
          };
          if (
            canonicalCommand(intent.recommendation) !==
            canonicalCommand(expected)
          )
            throw new Error(
              'Suggestion audit differs from the reviewed option.',
            );
        } else if (intent.recommendation)
          throw new Error('Unexpected suggestion audit.');
        if (
          intent.missionId !== mid ||
          intent.action !== action ||
          (policy &&
            canonicalCommand(intent.policy) !== canonicalCommand(policy)) ||
          (boundary &&
            canonicalCommand(intent.boundary) !== canonicalCommand(boundary)) ||
          (action === 'cancel' && intent.executionId !== executionId) ||
          (selection &&
            (intent.order !== selection.order ||
              !intent.members ||
              intent.members.length !== selection.members.length ||
              intent.members.some((m, i) =>
                Object.entries(m).some(
                  ([k, v]) => Reflect.get(selection.members[i], k) !== v,
                ),
              )))
        )
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
      submittedId =
        'commandId' in pending!.body
          ? pending!.body.commandId
          : pending!.body.creationId;
      await transmit(pending!, gen);
      return state.receipt?.requestId === submittedId
        ? state.receipt
        : undefined;
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
  async function foreground(...args: Parameters<typeof perform>) {
    const requestedGeneration = generation;
    if (renewal) await renewal;
    if (requestedGeneration !== generation) return;
    return perform(...args);
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
  async function submitMove(move: MoveIntent, commandId: string) {
    const requestedGeneration = generation;
    if (renewal) await renewal;
    if (requestedGeneration !== generation) return;
    if (disposed || state.busy || pending || move.missionId !== missionId)
      return;
    const gen = generation;
    emit({ busy: true, error: undefined });
    try {
      const session = identity();
      remember({
        missionId,
        body: {
          commandId,
          holderId: session.holderId,
          move,
          order: allocateOrder(),
        },
      });
      await transmit(pending!, gen);
    } catch (e) {
      if (!disposed && gen === generation)
        emit({
          error: pending
            ? 'Outcome unknown. Reconcile or retry the saved Move; its identity is retained.'
            : e instanceof Error
              ? e.message
              : 'Move unavailable.',
        });
    } finally {
      if (!disposed && gen === generation) emit({ busy: false });
    }
  }
  function saveDirect(values: DirectPending[]) {
    identity();
    // Persist the complete immutable content before either sending or forgetting it.
    storage!.setItem(directKey, JSON.stringify(values));
    directPending = values;
    emit({ directPending: values });
  }
  function rejectDirect(
    longitudeDeg: number,
    latitudeDeg: number,
    message: string,
  ) {
    const id = crypto.randomUUID();
    latestDirectId = id;
    emit({
      directFeedback: {
        id,
        longitudeDeg,
        latitudeDeg,
        stage: 'rejected',
        acknowledgedAt: Date.now(),
        message,
      },
    });
  }
  async function acceptDirect(value: unknown, sent: DirectPending) {
    const decoded = decodeReceipt(value);
    if (
      (decoded.schemaVersion !== '1.2' &&
        decoded.schemaVersion !== '1.3' &&
        decoded.schemaVersion !== '1.4' &&
        decoded.schemaVersion !== '1.5' &&
        decoded.schemaVersion !== '1.6') ||
      decoded.requestId !== sent.body.commandId ||
      decoded.operation !==
        (sent.body.direct.intercept ? 'intercept-approach' : 'direct-move') ||
      decoded.missionId !== sent.missionId ||
      ((decoded.schemaVersion === '1.5' || decoded.schemaVersion === '1.6') &&
      sent.body.direct.intercept
        ? decoded.behaviorOrder
        : decoded.directOrder) !== sent.body.direct.order
    )
      throw new Error('Direct movement receipt context mismatch.');
    if (decoded.accepted && decoded.runId !== sent.body.direct.runId)
      throw new Error('Direct receipt run mismatch.');
    const captured = sent.body.direct.members,
      outcomes =
        ((decoded.schemaVersion === '1.5' || decoded.schemaVersion === '1.6') &&
        sent.body.direct.intercept
          ? decoded.behaviorOutcomes
          : decoded.memberOutcomes) ?? [];
    if (
      (decoded.accepted &&
        (outcomes.length !== captured.length ||
          outcomes.some(
            (o, i) =>
              o.assetId !== captured[i].assetId ||
              o.entityId !== captured[i].entityId,
          ))) ||
      (!decoded.accepted &&
        outcomes.some(
          (o) =>
            !captured.some(
              (m) => m.assetId === o.assetId && m.entityId === o.entityId,
            ),
        ))
    )
      throw new Error('Direct receipt membership mismatch.');
    if (disposed) return;
    saveDirect(
      directPending.filter((p) => p.body.commandId !== sent.body.commandId),
    );
    const receipt = decoded;
    const receipts = [
      ...state.directReceipts.filter((r) => r.requestId !== receipt.requestId),
      receipt,
    ].slice(-32);
    const update: Partial<InteractiveState> = { directReceipts: receipts };
    if (
      missionId === sent.missionId &&
      sent.body.commandId === latestDirectId &&
      sent.body.direct.order >= latestDirectOrder
    ) {
      const outcomes =
        ((receipt.schemaVersion === '1.5' || receipt.schemaVersion === '1.6') &&
        sent.body.direct.intercept
          ? receipt.behaviorOutcomes
          : receipt.memberOutcomes) ?? [];
      const accepted = outcomes.filter((m) => m.outcome === 'accepted').length;
      const skipped = outcomes.length - accepted;
      const superseded = outcomes.some((m) => m.code === 'ORDER_SUPERSEDED');
      const interceptMessage =
        (receipt.schemaVersion === '1.5' || receipt.schemaVersion === '1.6') &&
        sent.body.direct.intercept
          ? `Intercept · ${receipt.targetScope?.length ?? 0} eligible targets · ${receipt.behaviorOutcomes?.filter((o) => o.state === 'pursuing').length ?? 0} assigned · ${receipt.behaviorOutcomes?.filter((o) => o.state === 'reserve').length ?? 0} held reserves${!receipt.targetScope?.length ? ' · No eligible targets' : ''}${skipped ? ` · ${skipped} skipped` : ''}`
          : undefined;
      const message = !receipt.accepted
        ? receipt.message
        : (interceptMessage ??
          (accepted
            ? `${accepted} commanded${skipped ? ` · ${skipped} skipped` : ''}`
            : superseded
              ? 'A newer destination is already accepted.'
              : 'No available drones.'));
      update.directReceipt = receipt;
      update.directFeedback = {
        id: sent.body.commandId,
        ...sent.body.direct.anchor,
        acknowledgedAt:
          state.directFeedback?.id === sent.body.commandId
            ? state.directFeedback.acknowledgedAt
            : 0,
        stage: receipt.accepted && accepted > 0 ? 'accepted' : 'rejected',
        message,
      };
    }
    emit(update);
    await refresh();
  }
  async function transmitDirect(sent: DirectPending) {
    const id = sent.body.commandId;
    if (directSending.has(id) || disposed) return;
    directSending.add(id);
    try {
      await acceptDirect(
        await request(
          `/${encodeURIComponent(sent.missionId)}/direct-moves`,
          'POST',
          sent.body,
          true,
        ),
        sent,
      );
    } catch {
      if (!disposed && latestDirectId === id && missionId === sent.missionId)
        emit({
          directFeedback: {
            id,
            ...sent.body.direct.anchor,
            stage: 'pending',
            acknowledgedAt: state.directFeedback?.acknowledgedAt ?? 0,
            message: 'Confirming destination…',
          },
        });
    } finally {
      directSending.delete(id);
    }
  }
  function allocateOrder() {
    const session = identity(),
      run = state.current?.run;
    const known =
      run?.controls.flatMap((c) =>
        c.lastDirectOrder &&
        c.lastDirectOrder.holderId === session.holderId &&
        c.lastDirectOrder.executorEpoch === run.executorEpoch &&
        c.lastDirectOrder.grantId === run.grantId &&
        c.lastDirectOrder.grantRevision === run.grantRevision
          ? [c.lastDirectOrder.order]
          : [],
      ) ?? [];
    const order = Math.max(nextOrder, ...known, 0) + 1;
    if (!Number.isSafeInteger(order))
      throw new Error('Operator order unavailable.');
    storage!.setItem(orderKey, String(order));
    nextOrder = order;
    return order;
  }
  async function submitDirect(direct: Omit<DirectMoveIntent, 'order'>) {
    if (disposed || direct.missionId !== missionId) return;
    try {
      if (directPending.length >= 64)
        throw new Error('Waiting for outstanding destinations to reconcile.');
      const session = identity();
      const order = allocateOrder();
      const sent: DirectPending = {
        missionId: direct.missionId,
        body: {
          commandId: crypto.randomUUID(),
          holderId: session.holderId,
          direct: structuredClone({ ...direct, order }),
        },
      };
      saveDirect([...directPending, sent]);
      latestDirectId = sent.body.commandId;
      latestDirectOrder = order;
      emit({
        directReceipt: undefined,
        directFeedback: {
          id: latestDirectId,
          ...direct.anchor,
          stage: 'pending',
          acknowledgedAt: Date.now(),
          message: direct.intercept
            ? 'Intercept approach requested · 250 m area'
            : 'Destination requested',
        },
      });
      await transmitDirect(sent);
      return state.directFeedback;
    } catch (e) {
      rejectDirect(
        direct.anchor.longitudeDeg,
        direct.anchor.latitudeDeg,
        e instanceof Error ? e.message : 'Destination unavailable.',
      );
      return state.directFeedback;
    }
  }
  let reconcilingDirect = false;
  let reconcileCursor = 0;
  async function reconcileDirect() {
    if (reconcilingDirect) return;
    reconcilingDirect = true;
    const candidates = directPending.filter(
      (p) => !directSending.has(p.body.commandId),
    );
    const start = candidates.length ? reconcileCursor % candidates.length : 0;
    const batch = [
      ...candidates.slice(start),
      ...candidates.slice(0, start),
    ].slice(0, 4);
    reconcileCursor = start + batch.length;
    try {
      await Promise.all(
        batch.map(async (sent) => {
          if (disposed || directSending.has(sent.body.commandId)) return;
          directSending.add(sent.body.commandId);
          let missing = false;
          try {
            await acceptDirect(
              await request(
                `/${encodeURIComponent(sent.missionId)}/receipts?identity=${encodeURIComponent(sent.body.commandId)}`,
              ),
              sent,
            );
          } catch (e) {
            missing = (e as { status?: number }).status === 404;
          } finally {
            directSending.delete(sent.body.commandId);
          }
          // Retries keep the original order, identity, content and admission deadline.
          if (missing && !disposed) await transmitDirect(sent);
        }),
      );
    } finally {
      reconcilingDirect = false;
    }
  }
  async function manageControl() {
    if (
      disposed ||
      managing ||
      state.busy ||
      pending ||
      !missionId ||
      released.includes(missionId)
    )
      return;
    managing = true;
    try {
      for (let step = 0; step < 3; step++) {
        const current = state.current;
        if (
          !current ||
          current.run.missionId !== missionId ||
          current.run.state === 'ended'
        )
          break;
        if (!current.ownsControl) {
          if (current.leaseState === 'unclaimed') await perform('acquire');
          else if (
            current.leaseState === 'expired' &&
            current.run.lease.holderId === privateSession?.holderId
          )
            await perform('reclaim');
          else break; // A valid other owner is never displaced.
          if (storageFault || pending || state.receipt?.accepted === false)
            break;
        } else if (startup === missionId && current.run.state === 'ready') {
          await perform('start');
          if (storageFault || pending || state.receipt?.accepted === false)
            break;
        } else break;
      }
      if (
        startup === missionId &&
        state.current?.run.state === 'running' &&
        state.current.run.lastReportAt
      ) {
        storage?.removeItem(startupKey);
        startup = undefined;
        emit({ startingDemo: false });
      }
    } finally {
      managing = false;
    }
  }
  async function newDemo(scenario?: ScenarioRef) {
    if (disposed || state.startingDemo || state.busy || pending) return;
    if (state.entry?.activeMissionId) {
      if (scenario) {
        emit({
          error: 'End the active demo before running a saved arrangement.',
        });
        return;
      }
      options.loadMission(state.entry.activeMissionId);
      return;
    }
    creatingDemo = true;
    try {
      identity();
      storage!.setItem(startupKey, 'creating');
      startup = 'creating';
      emit({ startingDemo: true });
      await perform('create', undefined, scenario);
      if (!pending && state.receipt?.accepted === false) {
        storage!.removeItem(startupKey);
        startup = undefined;
        emit({ startingDemo: false });
      }
      await manageControl();
    } catch (e) {
      emit({
        startingDemo: false,
        error: e instanceof Error ? e.message : 'Demo startup unavailable.',
      });
    } finally {
      creatingDemo = false;
    }
  }
  async function poll() {
    await refresh();
    if (pending && !state.busy) {
      await reconcile();
      if (pending && state.error?.startsWith('No committed receipt yet.'))
        await reconcile(true);
    }
    void reconcileDirect();
    await manageControl();
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
    ) {
      // Give a foreground command the completed lease revision instead of silently
      // dropping its click while the shared owner is renewing in the background.
      renewal = Promise.resolve().then(() => perform('renew'));
      emit({ renewing: true });
      try {
        await renewal;
      } finally {
        renewal = undefined;
        if (!disposed) emit({ renewing: false });
      }
    }
    if (!disposed)
      timer = setTimeout(
        () => {
          void poll();
        },
        state.startingDemo ? 500 : 5_000,
      );
  }
  return {
    get: () => immutableCopy(state),
    reportControlError: (error: string) => emit({ error }),
    perform: foreground,
    async injectDemoFault(
      frameId: string,
      assetId: string,
      kind: 'camera' | 'link' | 'asset',
    ) {
      if (!missionId || disposed) throw new Error('Open a current demo.');
      const session = identity();
      const result = await request(
        `/${encodeURIComponent(missionId)}/demo-faults`,
        'POST',
        { frameId, assetId, holderId: session.holderId, kind },
        true,
      );
      return result as {
        frameId: string;
        sequence: number;
        kind: string;
        assetId: string;
        simulated: true;
      };
    },
    async requestSuggestions(entityIds: string[]) {
      if (!missionId || disposed) throw new Error('Open a current demo.');
      const mid = missionId,
        gen = generation;
      const value = decodeRecommendations(
        await request(
          `/${encodeURIComponent(mid)}/recommendations`,
          'POST',
          { entityIds },
          true,
          true,
        ),
      );
      if (disposed || gen !== generation || value.missionId !== mid)
        throw new Error('Suggestion context changed; refresh.');
      return value;
    },
    applySuggestion(
      set: RecommendationSet,
      option: RecommendationOption,
      current: () => boolean,
    ) {
      if (!option.action) return Promise.resolve(undefined);
      return foreground(
        option.action.operation,
        undefined,
        undefined,
        structuredClone(option.action.members),
        undefined,
        option.action.policy ?? undefined,
        { set: structuredClone(set), option: structuredClone(option), current },
      );
    },
    selectedControl: (
      action: 'stop' | 'return-to-script',
      members: DirectMoveMember[],
    ) => foreground(action, undefined, undefined, structuredClone(members)),
    applyBehavior: (members: DirectMoveMember[], policy: BehaviorPolicy) =>
      foreground(
        'behavior',
        undefined,
        undefined,
        structuredClone(members),
        undefined,
        structuredClone(policy),
      ),
    submitMove,
    submitDirect,
    rejectDirect,
    newDemo,
    reconcileDirect,
    reconcile,
    refresh,
    setMission(mid?: string) {
      if (missionId === mid) return;
      generation++;
      abort?.abort();
      for (const controller of advisoryReads) controller.abort();
      missionId = mid;
      const latest = directPending
        .filter((p) => p.missionId === mid)
        .sort((a, b) => b.body.direct.order - a.body.direct.order)[0];
      latestDirectId = latest?.body.commandId;
      latestDirectOrder = latest?.body.direct.order ?? -1;
      emit({
        current: undefined,
        busy: false,
        receipt: undefined,
        movementReceipt: undefined,
        directReceipt: undefined,
        directFeedback: undefined,
        error: pending ? 'A saved request needs reconciliation.' : undefined,
      });
      void refresh().then(manageControl);
    },
    start() {
      if (!healthTimer)
        healthTimer = setInterval(() => {
          if (clockAnchor && !disposed)
            emit({
              now: new Date(
                Date.parse(clockAnchor.iso) +
                  performance.now() -
                  clockAnchor.elapsed,
              ).toISOString(),
            });
        }, 1000);
      if (!timer)
        timer = setTimeout(() => {
          void poll();
        }, 0);
    },
    dispose() {
      disposed = true;
      generation++;
      abort?.abort();
      for (const controller of advisoryReads) controller.abort();
      clearTimeout(timer);
      clearInterval(healthTimer);
    },
  };
}
