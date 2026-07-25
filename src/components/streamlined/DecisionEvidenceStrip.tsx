import { useAppSelector } from '../../store'
import { assessDecisionContext, assessDecisionEvidence } from '../../utils/decision'

export function DecisionEvidenceStrip({ trackId }: { trackId: string }) {
  const track = useAppSelector((s) => s.threats.tracks.find((t) => t.id === trackId))
  const asset = useAppSelector((s) => s.mission.protectedAsset)
  const zones = useAppSelector((s) => s.policy.zones)
  const lastSyncAt = useAppSelector((s) => s.session.lastSyncAt)

  if (!track) return null

  const evidence = assessDecisionEvidence(track, asset, zones, lastSyncAt)
  const context = assessDecisionContext(track)
  const stale = evidence.lastUpdateSec != null && evidence.lastUpdateSec > 5
  const critical = evidence.lastUpdateSec != null && evidence.lastUpdateSec > 12

  return (
    <div
      className={[
        'v4-evidence',
        critical ? 'is-crit' : stale ? 'is-warn' : evidence.roePass ? 'is-ok' : 'is-warn',
      ].join(' ')}
      role="status"
      aria-live="polite"
    >
      <p className="v4-evidence__roe">{context.roeHint}</p>
      <ul className="v4-evidence__factors">
        {context.factors.slice(0, 3).map((f) => (
          <li key={f}>{f}</li>
        ))}
        <li className="mono">
          Sensors {evidence.sensorCount} · buffer {evidence.civilianBufferM} m
          {evidence.lastUpdateSec != null ? ` · data ${evidence.lastUpdateSec}s` : ''}
        </li>
      </ul>
    </div>
  )
}
