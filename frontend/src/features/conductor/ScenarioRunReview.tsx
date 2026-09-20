import { useRef } from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';

/** Read-only review; Orchestrator owns the single Save/Validate/Run area. */
export function ScenarioRunReview() {
  const runtime = useOperationalRuntime()!,
    state = useOperationalSnapshot(runtime),
    s = state.scenario,
    review = s.review;
  const focus = useRef<HTMLDivElement>(null);
  if (!s.active || !review) return null;
  return (
    <section className="units-review scenario-run-review">
      <div ref={focus} tabIndex={-1} aria-label="Scenario validation review">
        <h2>
          <span>
            {review.canRun ? 'Ready to run' : 'Review needs attention'}
          </span>{' '}
          · r{review.reference.revision}
        </h2>
        <p>
          {review.counts.total} entities · {review.counts.controlled} controlled
          · {review.counts.observationOnly} observation only
        </p>
        <p>
          {review.counts.friendly} friendly · {review.counts.hostile} hostile ·{' '}
          {review.counts.unknown} unknown
        </p>
        <p>
          {review.actionCount} scripted actions · {review.boundaryCount}{' '}
          boundaries. Notional motion:{' '}
          {Object.keys(review.motionPreset.unitProfiles ?? {}).length
            ? 'per unit profile'
            : `${(review.motionPreset.speedMps * 3.6).toFixed(0)} km/h`}
          ; supplied height preserved.
        </p>
        {!!review.timings?.length && (
          <details>
            <summary>Timing and predecessor review</summary>
            <ul>
              {review.timings.map((t) => {
                const a = s.saved?.content.actions?.find(
                    (a) => a.id === t.actionId,
                  ),
                  p = s.saved?.content.actions?.find(
                    (a) => a.id === t.afterActionId,
                  );
                return (
                  <li key={t.actionId}>
                    {
                      s.saved?.content.units.find((u) => u.id === a?.unitId)
                        ?.label
                    }{' '}
                    ·{' '}
                    {t.afterActionId
                      ? `after ${p?.id.slice(0, 8)} + ${(t.delayMs ?? 0) / 1000}s`
                      : `at ${(a?.offsetMs ?? 0) / 1000}s`}{' '}
                    · estimated{' '}
                    {t.estimatedStartMs == null
                      ? 'unavailable'
                      : `${(t.estimatedStartMs / 1000).toFixed(1)}s`}{' '}
                    · {t.nominalState}
                  </li>
                );
              })}
            </ul>
            <p>
              Estimates assume the saved plan. Actual completion, overrides and
              effective boundary rules determine execution.
            </p>
          </details>
        )}
        {review.issues.map((i, n) => (
          <p role="alert" key={n}>
            {i.message}
          </p>
        ))}
        <details>
          <summary>Exact revision identity</summary>
          <p>{review.reference.definitionId}</p>
          <p>{review.reference.contentHash}</p>
        </details>
        <p className="units-hint">
          Run rechecks authoritative admission. Validation grants no live
          control.
        </p>
      </div>
    </section>
  );
}
