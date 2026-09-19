import type {
  RecommendationSet,
  RecommendationOption,
} from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { RuntimeSnapshot } from '../app/runtime';
import type { createInteractiveClient } from './interactiveClient';
import { immutableCopy } from '../world/immutable';

type Input = Pick<
  RuntimeSnapshot,
  'presentation' | 'session' | 'interactive' | 'connection' | 'scenario'
>;
export interface RecommendationState {
  status:
    | 'idle'
    | 'loading'
    | 'ready'
    | 'outdated'
    | 'applying'
    | 'submitted'
    | 'kept'
    | 'error';
  data?: DeepReadonly<RecommendationSet>;
  message?: string;
  appliedOptionId?: string;
}
export const suggestionSelection = (state: Input) =>
  state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map((i) => i.id)
    .sort();

export function suggestionContextReason(
  state: Input,
  applying = false,
): string | undefined {
  const frame = state.presentation.frame,
    run = frame?.interactive;
  if (state.scenario.active || state.presentation.mode !== 'live' || !run)
    return 'Open a live local demo to review suggestions.';
  if (run.state === 'ended') return 'Recorded and ended runs are read-only.';
  if (
    state.connection !== 'connected' ||
    state.presentation.status !== 'current'
  )
    return 'Wait for a connected, current simulation state.';
  if (!suggestionSelection(state).length)
    return 'Select friendly simulated units to review options.';
  if (applying) {
    if (
      state.interactive.pending ||
      state.interactive.directPending.length ||
      state.interactive.busy
    )
      return 'Resolve the pending command first.';
    const current = state.interactive.current;
    if (!current?.ownsControl)
      return 'Acquire or reclaim control using Simulation first.';
    if (
      current.run.runId !== run.runId ||
      current.run.executorEpoch !== run.executorEpoch ||
      current.run.runRevision !== run.runRevision ||
      current.run.grantRevision !== run.grantRevision
    )
      return 'Synchronizing demo control.';
    if (!['running', 'paused'].includes(run.state))
      return 'Start the demo before applying an option.';
  }
}

function scopeKey(state: Input) {
  const frame = state.presentation.frame;
  return JSON.stringify([
    state.scenario.active,
    state.presentation.mode,
    frame?.mission.id,
    frame?.recordingId,
    frame?.interactive?.runId,
    frame?.interactive?.executorEpoch,
    frame?.interactive?.sourceId,
    suggestionSelection(state),
  ]);
}

/** Cheap committed-state invalidation; server additionally rechecks current geometry. */
export function suggestionRelevantKey(state: Input) {
  const frame = state.presentation.frame,
    run = frame?.interactive,
    ids = suggestionSelection(state);
  if (!frame || !run) return '';
  return JSON.stringify([
    run.runRevision,
    run.grantRevision,
    run.lease.holderId,
    state.interactive.current?.ownsControl,
    run.controls.filter((c) => ids.includes(c.entityId)),
    frame.boundaryRules,
    frame.liveBoundaries,
    frame.zones,
    Object.values(frame.entities).map((e) => [
      e.id,
      e.affiliation,
      e.condition,
      e.presence,
    ]),
    Object.values(frame.tracks).map((t) => [
      t.id,
      t.entityId,
      t.state,
      t.source,
      t.latest.position.altitude.reference,
      t.latest.position.altitude.datumId,
    ]),
    Object.values(frame.assets).map((a) => [a.id, a.availability]),
    frame.fleetBehavior?.members
      ?.filter((m) => ids.includes(m.entityId))
      .map((m) => [
        m.id,
        m.policy,
        m.state,
        m.assignmentId,
        m.reservationRevision,
      ]),
    frame.fleetBehavior?.assignments
      ?.filter((a) => a.state === 'active')
      .map((a) => [a.id, a.assetId, a.targetId]),
    run.executions
      ?.filter(
        (e) =>
          ids.includes(e.entityId) &&
          ![
            'Completed',
            'Cancelled',
            'Failed',
            'Expired',
            'Interrupted',
          ].includes(e.state),
      )
      .map((e) => [e.id, e.state, e.revision]),
    frame.scenarioSchedule?.manualOverrides,
    frame.scenarioSchedule?.actions
      .filter((a) => ids.includes(a.entityId))
      .map((a) => [a.action.id, a.state]),
  ]);
}

/** One session-owned read controller; Apply remains owned by InteractiveClient. */
export function createRecommendationClient(options: {
  input: () => Input;
  interactive: Pick<
    ReturnType<typeof createInteractiveClient>,
    'requestSuggestions' | 'applySuggestion' | 'get'
  >;
  publish: () => void;
}) {
  let state: Readonly<RecommendationState> = Object.freeze({ status: 'idle' });
  let scope: string | undefined, relevant: string | undefined;
  let generation = 0,
    disposed = false;
  const set = (update: Partial<RecommendationState>) => {
    state = Object.freeze({ ...state, ...update });
  };
  const emit = (update: Partial<RecommendationState>) => {
    set(update);
    options.publish();
  };
  function sync(input: Input) {
    const key = scopeKey(input);
    if (
      key !== scope ||
      input.presentation.frame?.interactive?.state === 'ended'
    ) {
      generation++;
      scope = key;
      relevant = undefined;
      state = Object.freeze({ status: 'idle' });
    } else if (
      state.status === 'loading' &&
      relevant !== suggestionRelevantKey(input)
    ) {
      generation++;
      set({
        status: 'error',
        message: 'Situation changed while reviewing — refresh.',
      });
    } else if (state.data && state.status === 'ready') {
      const unavailable = suggestionContextReason(input);
      if (unavailable || relevant !== suggestionRelevantKey(input))
        set({
          status: 'outdated',
          message:
            unavailable ??
            'Out of date — refresh. Orders, availability, assignments or boundaries changed.',
        });
      else if (
        input.interactive.now &&
        input.interactive.now >= state.data.expiresAt
      )
        set({
          status: 'outdated',
          message: 'Out of date — refresh. The 15-second review expired.',
        });
    }
    return state;
  }
  return {
    sync,
    async refresh() {
      if (disposed || state.status === 'loading' || state.status === 'applying')
        return;
      const input = options.input();
      sync(input);
      const reason = suggestionContextReason(input);
      if (reason) {
        if (reason) emit({ status: 'error', message: reason });
        return;
      }
      const gen = ++generation,
        key = scopeKey(input);
      relevant = suggestionRelevantKey(input);
      emit({
        status: 'loading',
        data: undefined,
        message: undefined,
        appliedOptionId: undefined,
      });
      try {
        const result = await options.interactive.requestSuggestions(
          suggestionSelection(input),
        );
        if (disposed || gen !== generation || key !== scopeKey(options.input()))
          return;
        const current = options.input().presentation.frame?.interactive;
        if (
          result.runId !== current?.runId ||
          result.executorEpoch !== current.executorEpoch ||
          result.sourceId !== current.sourceId ||
          JSON.stringify(result.selectedEntityIds) !==
            JSON.stringify(suggestionSelection(options.input()))
        )
          throw new Error('Suggestion context mismatch; refresh.');
        emit({
          status: 'ready',
          data: immutableCopy(result),
          message: result.unavailableReason ?? undefined,
        });
      } catch (error) {
        if (!disposed && gen === generation)
          emit({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Suggestions unavailable. Fleet controls remain available.',
          });
      }
    },
    async apply(optionId: string) {
      const input = options.input();
      sync(input);
      const data = state.data,
        option = data?.options.find((o) => o.id === optionId);
      if (!data || !option || disposed || state.status === 'applying') return;
      if (!option.action) {
        emit({
          status: 'kept',
          message: 'Current orders kept. No command sent.',
        });
        return;
      }
      const reason =
        suggestionContextReason(input, true) ?? data.unavailableReason;
      if (state.status !== 'ready' || reason) {
        if (reason) emit({ message: reason });
        return;
      }
      const gen = generation,
        key = scopeKey(input);
      emit({
        status: 'applying',
        appliedOptionId: optionId,
        message: 'Submitting the reviewed option…',
      });
      const receipt = await options.interactive.applySuggestion(
        structuredClone(data) as RecommendationSet,
        structuredClone(option) as RecommendationOption,
        () =>
          !disposed &&
          gen === generation &&
          key === scopeKey(options.input()) &&
          relevant === suggestionRelevantKey(options.input()),
      );
      if (disposed || gen !== generation || key !== scopeKey(options.input()))
        return;
      const command = options.interactive.get();
      const outcomes =
        receipt?.schemaVersion === '1.6'
          ? receipt.behaviorOutcomes?.length
            ? receipt.behaviorOutcomes
            : receipt.controlOutcomes
          : [];
      const accepted =
        outcomes?.filter((o) => o.outcome === 'accepted').length ?? 0;
      const skipped =
        outcomes?.filter((o) => o.outcome === 'skipped').length ?? 0;
      emit({
        status: receipt?.accepted ? 'submitted' : 'outdated',
        message: receipt
          ? receipt.accepted
            ? `Command accepted · ${accepted} members accepted${skipped ? ` · ${skipped} skipped` : ''}. Inspect member receipts and execution results in Activity.`
            : receipt.message
          : command.pending
            ? 'Outcome unknown — use Attention to reconcile the saved request.'
            : (command.error ?? 'Option not submitted; refresh.'),
      });
    },
    dismiss() {
      if (disposed || state.status === 'applying') return;
      generation++;
      state = Object.freeze({ status: 'idle' });
      options.publish();
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
