import { useState } from 'react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { BehaviorPolicy } from '../../contracts/generated';
import { captureBehavior, interceptSelection } from '../../world/behavior';
import { directStatusText } from './presentation';

export function BehaviorControls({
  state,
  runtime,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
}) {
  const [kind, setKind] = useState<BehaviorPolicy['kind']>('hold');
  const [boundary, setBoundary] = useState('');
  const frame = state.presentation.frame;
  if (!frame?.fleetBehavior || state.scenario.active) return null;
  const proximity = frame.fleetBehavior.ruleVersion === 'local-fleet-v2';
  const patrols = Object.entries(frame.boundaryRules?.zones ?? {}).filter(
    ([, type]) => type === 'patrol',
  );
  const selectedBoundary = patrols.some(([id]) => id === boundary)
    ? boundary
    : patrols[0]?.[0];
  let reason: string | undefined;
  try {
    captureBehavior(state, kind, selectedBoundary);
  } catch (e) {
    reason = e instanceof Error ? e.message : 'Behavior unavailable.';
  }
  const mode = interceptSelection(state);
  const receipt = state.interactive.receipt;
  return (
    <section className="fleet-behavior" aria-label="Fleet behavior">
      <div className="fleet-behavior-row">
        <label>
          Behavior
          <select
            aria-label="Behavior"
            value={kind}
            onChange={(e) => setKind(e.target.value as BehaviorPolicy['kind'])}
          >
            <option value="hold">
              {proximity ? 'Manual' : 'Hold / Manual'}
            </option>
            <option value="intercept">Intercept</option>
            <option value="patrol">Patrol</option>
          </select>
        </label>
        <button
          disabled={!!reason}
          title={reason ?? 'Apply to the selected controlled drones.'}
          onClick={() => void runtime.applyBehavior(kind, selectedBoundary)}
        >
          Apply
        </button>
      </div>
      {kind === 'patrol' && (
        <label>
          Patrol boundary
          <select
            aria-label="Patrol boundary"
            value={selectedBoundary ?? ''}
            onChange={(e) => setBoundary(e.target.value)}
          >
            {!patrols.length && <option value="">No Patrol boundaries</option>}
            {patrols.map(([id]) => (
              <option key={id} value={id}>
                {frame.zones[id]?.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="fleet-behavior-hint">
        {reason ??
          (!proximity
            ? 'Legacy fleet rules: Intercept arms a 250 m map approach; excess members hold. Create a fresh Run for proximity acquisition.'
            : mode.mixed
              ? 'Mixed stances. Right-click moves every eligible selected drone.'
              : mode.armed
                ? 'INTERCEPT ENABLED · right-click to move. Nearby targets acquired automatically; Stop disarms.'
                : kind === 'intercept'
                  ? 'Apply enables automatic proximity acquisition, while moving or stationary.'
                  : kind === 'patrol'
                    ? 'Validated inset loop and straight ingress. Reapply after geometry changes.'
                    : 'Apply disables autonomous engagement and resumes any unfinished destination.')}
      </p>
      {(kind === 'intercept' || mode.armed) && (
        <small>
          {frame.fleetBehavior.model.acquisitionRadiusM} m proximity rule; not
          sensor range. Local toy contact: 25 m, supplied heights unchanged.
        </small>
      )}
      {(receipt?.schemaVersion === '1.5' || receipt?.schemaVersion === '1.6') &&
        receipt.operation === 'behavior' && (
          <p role="status" className="fleet-behavior-result">
            Last behavior receipt · order {receipt.behaviorOrder} ·{' '}
            {receipt.accepted ? 'accepted' : 'refused'}
            <br />
            {receipt.behaviorOutcomes
              ?.map((o) => o.reason)
              .filter((r, i, a) => a.indexOf(r) === i)
              .join(' ') || receipt.message}
          </p>
        )}
      {state.interactive.directReceipt?.operation === 'intercept-approach' &&
        state.interactive.directReceipt.missionId === frame.mission.id && (
          <p role="status" className="fleet-behavior-result">
            Last Intercept receipt · {directStatusText(state)}
          </p>
        )}
    </section>
  );
}
