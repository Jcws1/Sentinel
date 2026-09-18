import { useRef, useSyncExternalStore } from 'react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import { missionDisplayName } from '../mission/MissionControls';

/** Presentation only: every action delegates to the existing session owner. */
export function ScenarioRunReview() {
  const runtime = useOperationalRuntime()!,
    state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    s = state.scenario;
  const focus = useRef<HTMLDivElement>(null);
  const activeId = state.interactive.entry?.activeMissionId;
  const active = state.catalog.missions.find((m) => m.id === activeId);
  const locked =
    !!s.edit ||
    !!s.actionEdit ||
    !!s.boundaryEdit ||
    !!s.placement ||
    s.busy ||
    !!s.pending ||
    !!s.blocked ||
    s.reviewing;
  const launching =
    state.interactive.busy ||
    !!state.interactive.pending ||
    state.interactive.startingDemo;
  const review = s.review;
  if (!s.active) return null;
  return (
    <section
      className="units-review scenario-run-review"
      aria-label="Saved scenario launch"
    >
      <strong>
        {s.saved && !s.dirty
          ? `${s.saved.content.name} · saved revision ${s.saved.revision}`
          : 'Save this plan before Run'}
      </strong>
      <p>
        A saved plan has no recording. Run creates a new mission from this exact
        revision.
      </p>
      <div className="units-actions">
        <button
          disabled={locked || s.dirty || !s.saved}
          onClick={async () => {
            await runtime.validateScenario();
            requestAnimationFrame(() => focus.current?.focus());
          }}
        >
          {s.reviewing ? 'Validating…' : 'Validate saved revision'}
        </button>
        <button
          className="units-primary"
          disabled={
            locked ||
            launching ||
            s.dirty ||
            !s.saved ||
            !review?.canRun ||
            !!activeId
          }
          onClick={() => void runtime.runScenario()}
        >
          Run saved revision {s.saved?.revision}
        </button>
      </div>
      {activeId && (
        <div className="units-notice">
          <p>
            Active demo:{' '}
            <strong>{active ? missionDisplayName(active) : activeId}</strong>.
            Return and End it before starting this plan; the plan stays saved.
          </p>
          <button onClick={() => runtime.loadMission(activeId)}>
            Return to active demo
          </button>
        </div>
      )}
      {review && (
        <div ref={focus} tabIndex={-1} aria-label="Scenario validation review">
          <h2>
            {review.canRun ? 'Ready to run' : 'Review needs attention'} · r
            {review.reference.revision}
          </h2>
          <p>
            {review.counts.total} entities · {review.counts.controlled}{' '}
            controlled · {review.counts.observationOnly} observation only
          </p>
          <p>
            {review.counts.friendly} friendly · {review.counts.hostile} hostile
            · {review.counts.unknown} unknown
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
                Estimates assume the saved plan. Actual completion, overrides
                and effective boundary rules determine execution.
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
      )}
      {state.interactive.pending && (
        <button
          disabled={state.interactive.busy}
          onClick={() => void runtime.reconcileInteractive(true)}
        >
          Retry saved Run request
        </button>
      )}
      {state.interactive.error && <p role="alert">{state.interactive.error}</p>}
    </section>
  );
}
