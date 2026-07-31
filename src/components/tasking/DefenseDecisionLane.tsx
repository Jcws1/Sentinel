import { useEffect, useState } from 'react'
import { useAppSelector } from '../../store'
import type { TaskingRecommendation, ThreatTrack } from '../../types'
import {
  assessDecisionContext,
  assessDecisionEvidence,
  urgencyLabel,
} from '../../utils/decision'
import { EngageButton } from '../EngageButton'

export function DefenseDecisionLane({
  pending,
  active,
  activeTrack,
  activeIndex,
  isAlert,
  busy,
  confirmAllArmedUntil,
  onSelectPending,
  onVeto,
  onConfirmAll,
}: {
  pending: TaskingRecommendation[]
  active: TaskingRecommendation
  activeTrack: ThreatTrack
  activeIndex: number
  isAlert: boolean
  busy: boolean
  confirmAllArmedUntil: number
  hotkeysArmed: boolean
  onSelectPending: (recId: string, trackId: string) => void
  onStepPending: (delta: number) => void
  onVeto: () => void
  onConfirmAll: () => void
}) {
  const mission = useAppSelector((s) => s.mission)
  const policyZones = useAppSelector((s) => s.policy.zones)
  const lastSyncAt = useAppSelector((s) => s.session.lastSyncAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const decisionContext = assessDecisionContext(activeTrack)
  const evidence = assessDecisionEvidence(
    activeTrack,
    mission.protectedAsset,
    policyZones,
    lastSyncAt,
    now,
  )
  const selectedDroneId = active.droneIds[0] ?? null

  return (
    <div
      className={[
        'action-panel',
        'action-panel--ranked',
        'map-ui-surface',
        `action-panel--${decisionContext.urgency}`,
        isAlert ? 'action-panel--alert' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label="Intercept decision"
    >
      {pending.length > 1 && (
        <div className="decision-queue" role="tablist" aria-label="Pending decisions">
          {pending.map((rec, index) => {
            const track = rec.trackId === activeTrack.id ? activeTrack : null
            return (
              <button
                key={rec.id}
                type="button"
                role="tab"
                aria-selected={rec.id === active.id}
                className={['decision-queue__item', rec.id === active.id ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectPending(rec.id, rec.trackId)}
              >
                <span className="decision-queue__index mono">{index + 1}</span>
                <span className="decision-queue__id mono">{rec.trackId}</span>
                {track && <span className="decision-queue__eta mono">{track.etaToAsset}s</span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="action-panel__header">
        <div className="action-panel__badges">
          <span
            className={`decision-badge decision-badge--class-${activeTrack.threatClass.toLowerCase()}`}
          >
            Class {activeTrack.threatClass}
          </span>
          <span className={`decision-badge decision-badge--urgency-${decisionContext.urgency}`}>
            {urgencyLabel(decisionContext.urgency)}
          </span>
          {pending.length > 1 && (
            <span className="decision-badge decision-badge--queue mono">
              {activeIndex >= 0 ? activeIndex + 1 : 1} / {pending.length}
            </span>
          )}
        </div>
        <p className="action-panel__roe mono">{decisionContext.roeHint}</p>
      </div>

      <div className="action-panel__match-summary">
        <div>
          <p className="panel__eyebrow">Decide - Ranked recommendation</p>
          <h2 className="action-panel__title">
            {selectedDroneId ?? 'No interceptor selected'}
          </h2>
          <p>
            Ranked interceptor cards are available in the right inspector.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost action-panel__view-matches"
          onClick={() => window.dispatchEvent(new Event('sentinel:open-asset-matches'))}
        >
          View ranked assets
        </button>
      </div>

      <div className="decision-evidence" role="group" aria-label="Decision evidence">
        <span className={`decision-evidence__item ${evidence.roePass ? 'tone-ok' : 'tone-warn'}`}>
          <span className="decision-evidence__k">ROE</span>
          <span className="decision-evidence__v mono">{evidence.roePass ? 'PASS' : 'HOLD'}</span>
        </span>
        <span className="decision-evidence__item">
          <span className="decision-evidence__k">Sensors</span>
          <span className="decision-evidence__v mono">{evidence.sensorCount}</span>
        </span>
        <span
          className={`decision-evidence__item ${
            evidence.lastUpdateSec != null && evidence.lastUpdateSec > 5 ? 'tone-warn' : ''
          }`}
        >
          <span className="decision-evidence__k">Update</span>
          <span className="decision-evidence__v mono">
            {evidence.lastUpdateSec != null ? `${evidence.lastUpdateSec}s` : '-'}
          </span>
        </span>
        <span
          className={`decision-evidence__item ${
            evidence.civilianBufferM < 200
              ? 'tone-crit'
              : evidence.civilianBufferM < 500
                ? 'tone-warn'
                : ''
          }`}
        >
          <span className="decision-evidence__k">Civ buffer</span>
          <span className="decision-evidence__v mono">
            {evidence.civilianBufferM >= 1000
              ? `${(evidence.civilianBufferM / 1000).toFixed(1)}km`
              : `${evidence.civilianBufferM}m`}
          </span>
        </span>
      </div>

      <div className="action-panel__actions">
        <EngageButton
          trackId={active.trackId}
          variant="confirm"
          className="action-panel__engage"
          label={`Confirm ${selectedDroneId ?? 'asset'}`}
          disabled={busy}
        />
        <button type="button" className="btn btn--veto" disabled={busy} onClick={onVeto}>
          Veto
        </button>
        {pending.length > 1 && (
          <button
            type="button"
            className={[
              'btn btn--ok',
              Date.now() <= confirmAllArmedUntil ? 'btn--armed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy}
            onClick={onConfirmAll}
          >
            {Date.now() <= confirmAllArmedUntil
              ? `Confirm now (${pending.length})`
              : `Confirm all (${pending.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
