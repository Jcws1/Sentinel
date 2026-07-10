import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { pushToast } from '../store/taskingSlice'
import { abortEngagementCommand } from '../store/commandThunks'
import { toggleInvestigationCollapsed } from '../store/uiSlice'
import { actionTone, formatTime } from '../utils/geo'
import { CollapsiblePanel } from './CollapsiblePanel'

export function OperationsPanel() {
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const decisionLog = useAppSelector((s) => s.tasking.decisionLog)
  const mission = useAppSelector((s) => s.mission)
  const dispatch = useAppDispatch()
  const [busy, setBusy] = useState<string | null>(null)
  const investigationCollapsed = useAppSelector(
    (s) => s.ui.investigationCollapsed,
  )

  const engaged = recommendations.filter((r) => r.status === 'confirmed')
  const pending = recommendations.filter((r) => r.status === 'pending')
  const retasking = recommendations.filter(
    (r) => r.status === 'auto-executing' || r.autoExecuteAt,
  )

  const abort = async (trackId: string) => {
    if (busy) return
    setBusy(trackId)
    try {
      await dispatch(abortEngagementCommand(trackId)).unwrap()
    } catch (error) {
      dispatch(
        pushToast(error instanceof Error ? error.message : 'Abort failed'),
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <CollapsiblePanel
      side="left"
      eyebrow="Conduct"
      title="Operations"
      count={mission.state}
      collapsed={investigationCollapsed}
      onToggleCollapse={() => dispatch(toggleInvestigationCollapsed())}
      className="panel--operations"
    >
      <div className="ops-summary">
        <div className="ops-summary__stat">
          <span className="ops-summary__k">Engaged</span>
          <span className="ops-summary__v mono tone-ok">{engaged.length}</span>
        </div>
        <div className="ops-summary__stat">
          <span className="ops-summary__k">Pending</span>
          <span className="ops-summary__v mono tone-warn">{pending.length}</span>
        </div>
        <div className="ops-summary__stat">
          <span className="ops-summary__k">Retask</span>
          <span className="ops-summary__v mono">{retasking.length}</span>
        </div>
      </div>

      {engaged.length > 0 && (
        <section className="ops-section">
          <h3 className="ops-section__title">Active engagements</h3>
          <ul className="ops-engage-list">
            {engaged.map((rec) => (
              <li key={rec.id} className="ops-engage-list__item">
                <div className="ops-engage-list__main">
                  <span className="mono tone-ok">{rec.trackId}</span>
                  <span className="mono">{rec.droneIds.join(', ')}</span>
                  <span className="mono">{rec.etaSeconds}s</span>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost-crit btn--sm"
                  disabled={busy === rec.trackId}
                  onClick={() => void abort(rec.trackId)}
                >
                  {busy === rec.trackId ? '…' : 'Abort'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {retasking.length > 0 && (
        <section className="ops-section">
          <h3 className="ops-section__title">Re-tasking window</h3>
          <ul className="ops-engage-list">
            {retasking.map((rec) => (
              <li key={rec.id} className="ops-engage-list__item">
                <span className="mono">{rec.trackId}</span>
                <span className="mono tone-warn">
                  {rec.autoExecuteAt
                    ? `Auto ${Math.max(0, Math.ceil((rec.autoExecuteAt - Date.now()) / 1000))}s`
                    : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ops-section ops-section--log">
        <h3 className="ops-section__title">Decision log</h3>
        <ul className="decision-log">
          {decisionLog.length === 0 && (
            <li className="decision-log__empty">No operator actions yet</li>
          )}
          {decisionLog.map((entry, i) => (
            <li key={`${entry.timestamp}-${entry.action}-${i}`} className="decision-log__item">
              <span className="decision-log__time mono">
                {formatTime(entry.timestamp)}
              </span>
              <span
                className={[
                  'decision-log__action',
                  'mono',
                  actionTone(entry.action) ? `tone-${actionTone(entry.action)}` : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {entry.action}
              </span>
              <span className="decision-log__detail">{entry.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </CollapsiblePanel>
  )
}
