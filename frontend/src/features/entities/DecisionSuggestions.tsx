import { ChevronRight, RefreshCw } from 'lucide-react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import {
  suggestionContextReason,
  suggestionSelection,
} from '../../services/recommendationClient';
import './suggestions.css';

export function SuggestionsDisclosure({
  state,
  runtime,
  bridge,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
}) {
  if (!state.presentation.frame?.interactive || state.scenario.active)
    return null;
  const reason = suggestionContextReason(state);
  return (
    <details className="fleet-suggestions">
      <summary>
        <ChevronRight size={13} aria-hidden="true" /> Suggestions
      </summary>
      <div>
        <p>
          Review existing actions for {suggestionSelection(state).length}{' '}
          selected. Nothing changes until Apply.
        </p>
        <button
          disabled={!!reason}
          title={reason}
          onClick={() => {
            bridge.open('suggestions');
            void runtime.requestSuggestions();
          }}
        >
          Review options
        </button>
        {reason && <small>{reason}</small>}
      </div>
    </details>
  );
}

export function DecisionSuggestions({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const review = state.recommendations,
    data = review?.data;
  const selected = suggestionSelection(state);
  const readReason = suggestionContextReason(state);
  const applyReason =
    suggestionContextReason(state, true) ?? data?.unavailableReason;
  const busy = review?.status === 'loading' || review?.status === 'applying';
  const synchronizing =
    !!data && (state.presentation.frame?.sequence ?? -1) < data.sequence;
  const canApply = review?.status === 'ready' && !applyReason && !synchronizing;
  const labels = new Map(data?.members.map((m) => [m.entityId, m]));
  const ttl =
    data && state.interactive.now
      ? Math.min(
          15,
          Math.max(
            0,
            Math.ceil(
              (Date.parse(data.expiresAt) - Date.parse(state.interactive.now)) /
                1000,
            ),
          ),
        )
      : undefined;
  return (
    <div
      className="decision-suggestions"
      aria-label="Rules-based decision suggestions"
    >
      <header className="suggestions-header">
        <span className="suggestions-source">Rules-based · simulation</span>
        <div>
          <h2>Decision options</h2>
          <span className="suggestions-count">{selected.length} selected</span>
        </div>
        <p>
          Compare actions for the selected units. Nothing changes until Apply.
        </p>
        <div className="suggestions-toolbar">
          <button
            disabled={!!readReason || review?.status === 'applying'}
            aria-disabled={busy || undefined}
            title={readReason}
            onClick={() => {
              if (!busy) void runtime.requestSuggestions();
            }}
          >
            <RefreshCw size={13} aria-hidden="true" />{' '}
            {data ? 'Refresh options' : 'Get suggestions'}
          </button>
          {data && (
            <button
              className="text-control"
              disabled={review?.status === 'applying'}
              onClick={() => runtime.dismissSuggestions()}
            >
              Dismiss
            </button>
          )}
        </div>
      </header>
      <div className="suggestions-body">
        {(readReason || review?.message || synchronizing) && (
          <p
            role="status"
            className="suggestions-notice"
            data-state={review?.status}
          >
            {readReason ??
              (synchronizing
                ? 'Waiting for the displayed simulation state…'
                : review?.message)}
          </p>
        )}
        {review?.status === 'loading' && (
          <p role="status" className="suggestions-empty">
            Reviewing the current committed situation…
          </p>
        )}
        {!data && review?.status !== 'loading' && (
          <p className="suggestions-empty">
            Choose units in Fleet or on the map, then request options.
            Suggestions never select units or acquire control.
          </p>
        )}
        {data && (
          <>
            <section
              className="suggestions-situation"
              aria-label="Reviewed situation"
            >
              <div>
                <strong>Reviewed situation</strong>
                <span>
                  {review?.status === 'ready' && ttl !== undefined
                    ? `${ttl}s to apply`
                    : review?.status === 'outdated'
                      ? 'Out of date'
                      : review?.status === 'submitted'
                        ? 'Submitted'
                        : 'Snapshot'}
                </span>
              </div>
              <p>{data.situation}</p>
              <details>
                <summary>Selection and exclusions</summary>
                <ul>
                  {data.members.map((member) => (
                    <li key={member.entityId}>
                      <strong>{member.label}</strong>
                      <span>{member.exclusion ?? member.state}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
            <div className="suggestion-cards" aria-label="Decision options">
              {data.options.map((option) => (
                <article
                  key={option.id}
                  className="suggestion-card"
                  data-noop={!option.action}
                  data-applied={review.appliedOptionId === option.id}
                >
                  <h3>{option.title}</h3>
                  <p>{option.explanation}</p>
                  {option.action && (
                    <details className="suggestion-effects">
                      <summary>
                        {option.action.members.length} affected ·{' '}
                        {option.unchangedEntityIds.length} unchanged
                      </summary>
                      <ul>
                        {option.action.members.map((member) => (
                          <li key={member.entityId}>
                            <strong>
                              {labels.get(member.entityId)?.label ??
                                member.entityId}
                            </strong>
                            <span>{labels.get(member.entityId)?.state}</span>
                          </li>
                        ))}
                      </ul>
                      {!!option.unchangedEntityIds.length && (
                        <>
                          <strong className="suggestion-subheading">
                            Unchanged
                          </strong>
                          <ul>
                            {option.unchangedEntityIds.map((id) => (
                              <li key={id}>
                                <strong>{labels.get(id)?.label ?? id}</strong>
                                <span>
                                  {option.unchangedReasons.find(
                                    (r) => r.entityId === id,
                                  )?.disposition === 'excluded' &&
                                    'Excluded · '}
                                  {
                                    option.unchangedReasons.find(
                                      (r) => r.entityId === id,
                                    )?.reason
                                  }
                                </span>
                                {labels.get(id)?.available && (
                                  <span>{labels.get(id)?.state}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <ul className="suggestion-consequences">
                        {option.consequences.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="suggestion-card-action">
                    {option.action && (
                      <span>
                        {option.action.operation === 'behavior'
                          ? option.action.policy?.kind === 'hold'
                            ? 'Manual policy'
                            : `${option.action.policy?.kind === 'intercept' ? 'Intercept' : 'Patrol'} policy`
                          : option.action.operation === 'stop'
                            ? 'Stop and disarm'
                            : 'Return to script'}
                      </span>
                    )}
                    <button
                      disabled={option.action ? !canApply : busy}
                      title={
                        option.action
                          ? (applyReason ??
                            (review.status !== 'ready'
                              ? 'Refresh before applying another option.'
                              : undefined))
                          : undefined
                      }
                      aria-label={
                        option.action
                          ? `Apply ${option.title}`
                          : 'Keep current orders'
                      }
                      onClick={() => void runtime.applySuggestion(option.id)}
                    >
                      {option.action
                        ? review.status === 'applying' &&
                          review.appliedOptionId === option.id
                          ? 'Applying…'
                          : 'Apply'
                        : 'Keep current orders'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {applyReason && !readReason && (
              <p className="suggestions-footnote">{applyReason}</p>
            )}
          </>
        )}
        <footer className="suggestions-footer">
          <p>
            Known simulation data. No confidence, detection or outcome
            prediction.
          </p>
          <button
            className="text-control"
            onClick={() => bridge.open('movement')}
          >
            Open Activity
          </button>
        </footer>
      </div>
    </div>
  );
}
