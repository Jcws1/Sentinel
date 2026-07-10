import type { ModeId } from '../../store/uiSlice'

type BaseProps = {
  mission: string
}

export function ProactiveDefenseCard({
  mission,
  onAssign,
  onMark,
  onAcceptSwitch,
}: BaseProps & {
  onAssign: () => void
  onMark: () => void
  onAcceptSwitch: () => void
}) {
  return (
    <div className="scenario-control-card map-ui-surface">
      <p className="panel__eyebrow">{mission}</p>
      <h3>Prepare sectors before launch</h3>
      <p className="scenario-control-card__text">
        Build coverage, classify thermal anomalies, and pre-position relays.
      </p>
      <div className="scenario-control-card__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAssign}>
          Assign sectors
        </button>
        <button type="button" className="btn btn--ghost-warn btn--sm" onClick={onMark}>
          Mark anomaly
        </button>
        <button type="button" className="btn btn--ok btn--sm" onClick={onAcceptSwitch}>
          Accept switch
        </button>
      </div>
    </div>
  )
}

export function AreaReconCard({
  mission,
  scoutCount,
  avgScoutBattery,
  onAssign,
  onMark,
  onHandoff,
}: BaseProps & {
  scoutCount: number
  avgScoutBattery: number
  onAssign: () => void
  onMark: () => void
  onHandoff: () => void
}) {
  return (
    <div className="scenario-control-card map-ui-surface">
      <p className="panel__eyebrow">{mission}</p>
      <h3>Recon tasking</h3>
      <p className="scenario-control-card__text">
        Scout drones active: {scoutCount} · Avg battery: {avgScoutBattery}%
      </p>
      <div className="scenario-control-card__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAssign}>
          Assign block
        </button>
        <button type="button" className="btn btn--ghost-warn btn--sm" onClick={onMark}>
          Mark POI
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onHandoff}>
          Hand off scout
        </button>
      </div>
    </div>
  )
}

export function TargetedAttackCard({
  mission,
  label,
  authHolding,
  disabled,
  onStartAuth,
  onStopAuth,
  onEscalate,
}: BaseProps & {
  label: string
  authHolding: boolean
  disabled: boolean
  onStartAuth: () => void
  onStopAuth: () => void
  onEscalate: () => void
}) {
  return (
    <div className="scenario-control-card map-ui-surface">
      <p className="panel__eyebrow">{mission}</p>
      <h3>Deliberate authorization</h3>
      <p className="scenario-control-card__text">{label}</p>
      <div className="scenario-control-card__actions">
        <button
          type="button"
          className={['btn btn--ghost-crit btn--sm', authHolding ? 'is-holding' : '']
            .filter(Boolean)
            .join(' ')}
          disabled={disabled}
          onPointerDown={onStartAuth}
          onPointerUp={onStopAuth}
          onPointerLeave={onStopAuth}
        >
          {authHolding ? 'Hold… 3s' : 'Authorize strike'}
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEscalate}>
          Escalate
        </button>
      </div>
    </div>
  )
}

export function SaturationCard({
  mission,
  pendingCount,
  decoyEstimate,
  lowInterceptors,
  busy,
  hasActive,
  onBatchConfirm,
  onVeto,
  onIgnoreDecoys,
}: BaseProps & {
  pendingCount: number
  decoyEstimate: number
  lowInterceptors: number
  busy: boolean
  hasActive: boolean
  onBatchConfirm: () => void
  onVeto: () => void
  onIgnoreDecoys: () => void
}) {
  return (
    <div className="scenario-control-card map-ui-surface">
      <p className="panel__eyebrow">{mission}</p>
      <h3>Swarm monitor</h3>
      <p className="scenario-control-card__text">
        Pending: {pendingCount} · Decoy estimate: {decoyEstimate} · Low interceptors: {lowInterceptors}
      </p>
      <div className="scenario-control-card__actions">
        <button type="button" className="btn btn--ok btn--sm" disabled={busy || pendingCount === 0} onClick={onBatchConfirm}>
          Batch confirm
        </button>
        <button type="button" className="btn btn--ghost-warn btn--sm" disabled={!hasActive || busy} onClick={onVeto}>
          Veto anomaly
        </button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!hasActive || busy} onClick={onIgnoreDecoys}>
          Ignore decoys
        </button>
      </div>
    </div>
  )
}

export function DeniedOpsCard({
  mission,
  avgConfidence,
  positioning,
  deniedRisk,
  onCheckMesh,
  onRecall,
}: BaseProps & {
  avgConfidence: number
  positioning: string
  deniedRisk: boolean
  onCheckMesh: () => void
  onRecall: () => void
}) {
  return (
    <div className="scenario-control-card map-ui-surface">
      <p className="panel__eyebrow">{mission}</p>
      <h3>Confidence operations</h3>
      <p className="scenario-control-card__text">
        Avg confidence {avgConfidence}% · Positioning {positioning}
      </p>
      <div className="scenario-control-card__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCheckMesh}>
          Check mesh
        </button>
        <button type="button" className="btn btn--ghost-warn btn--sm" onClick={onRecall}>
          Recall swarm
        </button>
        {deniedRisk && <span className="tone-warn mono">Sync before commands</span>}
      </div>
    </div>
  )
}

export function shouldShowFlowRail(_mode: ModeId): boolean {
  return false
}
