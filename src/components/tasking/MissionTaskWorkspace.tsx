import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import {
  abortEngagementCommand,
  holdTrackCommand,
  requestPlanCommand,
} from '../../store/commandThunks'
import type { Drone, IntentAction, TaskingRecommendation, ThreatTrack } from '../../types'
import { assessDecisionContext, assessDecisionEvidence } from '../../utils/decision'
import { missionPlanSummary, taskWorkspaceCustody } from '../../utils/taskWorkspace'

const MODIFY_INTENTS: IntentAction[] = [
  'SWAP', 'REASSIGN', 'DELAY', 'PRIORITY_UP', 'PRIORITY_DOWN', 'HOLD', 'IGNORE', 'ESCALATE',
]

type PolicyState = 'within-authority' | 'approval-required' | 'blocked' | 'indeterminate'

interface TaskGroupView {
  recommendation: TaskingRecommendation
  track: ThreatTrack
  drones: Drone[]
  policyState: PolicyState
  policyLabel: string
  exception: string | null
  lastUpdateSec: number | null
}

function groupStatus(recommendation: TaskingRecommendation): string {
  if (recommendation.status === 'pending') return 'Review'
  if (recommendation.status === 'auto-executing') return 'Auto executing'
  if (recommendation.status === 'confirmed') return 'Executing'
  return 'Closed'
}

function groupObjective(track: ThreatTrack): string {
  return track.recommendedAction.trim() || (track.threatClass === 'I' ? 'Monitor' : 'Respond')
}

export function MissionTaskWorkspace({
  pending,
  engaged,
  active,
  activeTrack,
  busy,
  intentOpen,
  lastVetoed,
  onSelectTask,
  onApprovePlan,
  onReject,
  onApplyIntent,
  onSkipIntent,
}: {
  pending: TaskingRecommendation[]
  engaged: TaskingRecommendation[]
  active: TaskingRecommendation
  activeTrack: ThreatTrack
  busy: boolean
  intentOpen: boolean
  lastVetoed: TaskingRecommendation | null
  onSelectTask: (recommendationId: string, trackId: string) => void
  onApprovePlan: (recommendationIds: string[]) => void
  onReject: () => void
  onApplyIntent: (intent: IntentAction) => void
  onSkipIntent: () => void
}) {
  const dispatch = useAppDispatch()
  const mission = useAppSelector((state) => state.mission)
  const drones = useAppSelector((state) => state.fleet.drones)
  const tracks = useAppSelector((state) => state.threats.tracks)
  const zones = useAppSelector((state) => state.policy.zones)
  const lastSyncAt = useAppSelector((state) => state.session.lastSyncAt)
  const connected = useAppSelector((state) => state.session.connected)
  const [assetDrawerOpen, setAssetDrawerOpen] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [interventionBusy, setInterventionBusy] = useState(false)
  const [switchingAssetId, setSwitchingAssetId] = useState<string | null>(null)
  const [planArmedUntil, setPlanArmedUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const primaryAssetId = active.droneIds[0] ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    setAssetDrawerOpen(false)
    setOverrideOpen(false)
    setSelectedAssetId(primaryAssetId)
    setPlanArmedUntil(0)
  }, [active.id, primaryAssetId])

  const taskQueue = [...pending, ...engaged.filter((task) => !pending.some((item) => item.id === task.id))]
  const groups: TaskGroupView[] = taskQueue.flatMap((recommendation) => {
    const track = tracks.find((item) => item.id === recommendation.trackId)
    if (!track) return []
    const evidence = assessDecisionEvidence(track, mission.protectedAsset, zones, lastSyncAt, now)
    const assignedDrones = recommendation.droneIds.flatMap((id) => {
      const drone = drones.find((item) => item.id === id)
      return drone ? [drone] : []
    })
    const stale = evidence.lastUpdateSec != null && evidence.lastUpdateSec > 12
    const degraded = assignedDrones.find((drone) => drone.comms === 'lost' || drone.battery < 25)
    const missionBlocked = mission.state === 'HOLD' || mission.state === 'RECALL'

    let policyState: PolicyState = 'within-authority'
    let policyLabel = 'Within authority'
    let exception: string | null = null
    if (!connected) {
      policyState = 'indeterminate'
      policyLabel = 'Unable to evaluate'
      exception = 'C2 connection unavailable'
    } else if (missionBlocked || (!evidence.roePass && track.threatClass === 'I')) {
      policyState = 'blocked'
      policyLabel = 'Blocked'
      exception = missionBlocked ? `Mission is ${mission.state}` : 'Policy hold applies'
    } else if (stale) {
      policyState = 'indeterminate'
      policyLabel = 'Evidence stale'
      exception = `Track data is ${evidence.lastUpdateSec}s old`
    } else if (!evidence.roePass) {
      policyState = 'approval-required'
      policyLabel = 'Approval required'
      exception = 'Outside delegated authority'
    } else if (degraded) {
      exception = `${degraded.displayName || degraded.id} needs attention`
    }

    return [{
      recommendation,
      track,
      drones: assignedDrones,
      policyState,
      policyLabel,
      exception,
      lastUpdateSec: evidence.lastUpdateSec,
    }]
  })
  const selectedGroup = groups.find((group) => group.recommendation.id === active.id)
  const selectedTrack = selectedGroup?.track ?? activeTrack
  const selectedDecision = assessDecisionContext(selectedTrack)
  const summary = missionPlanSummary(taskQueue, drones)
  const exceptions = groups.filter((group) => group.exception)
  const approvableIds = groups
    .filter((group) => group.recommendation.status === 'pending' && group.policyState === 'within-authority')
    .map((group) => group.recommendation.id)
  const selectedDrone = drones.find((drone) => drone.id === selectedAssetId) ?? selectedGroup?.drones[0] ?? null
  const isPending = active.status === 'pending'
  const isExecuting = active.status === 'confirmed' || active.status === 'auto-executing'
  const custody = taskWorkspaceCustody(active)
  const unassignedDrones = drones.filter((drone) => !drone.assignedTrackId && drone.comms !== 'lost' && drone.battery >= 25)
  const canApprovePlan = approvableIds.length > 0 && connected && !busy && switchingAssetId == null
  const planApprovalArmed = planArmedUntil > now

  const selectAsset = async (droneId: string) => {
    if (!isPending || switchingAssetId || active.droneIds.includes(droneId)) return
    setSwitchingAssetId(droneId)
    try {
      await dispatch(requestPlanCommand({ trackId: active.trackId, preferredDroneIds: [droneId] })).unwrap()
      setSelectedAssetId(droneId)
      setOverrideOpen(false)
    } finally {
      setSwitchingAssetId(null)
    }
  }

  const intervene = async (kind: 'hold' | 'abort') => {
    if (interventionBusy) return
    setInterventionBusy(true)
    try {
      if (kind === 'hold') await dispatch(holdTrackCommand(active.trackId)).unwrap()
      else await dispatch(abortEngagementCommand(active.trackId)).unwrap()
    } finally {
      setInterventionBusy(false)
    }
  }

  const approvePlan = () => {
    if (!canApprovePlan) return
    if (!planApprovalArmed) {
      setPlanArmedUntil(Date.now() + 5000)
      return
    }
    setPlanArmedUntil(0)
    onApprovePlan(approvableIds)
  }

  return (
    <section className="mission-task-workspace map-ui-surface" aria-label="Mission task workspace" data-operator-ui>
      <header className="mission-task-workspace__header">
        <div>
          <p className="panel__eyebrow">Mission plan</p>
          <h2>Protect designated asset</h2>
          <p>{summary.groupCount} groups / {summary.assignedAssetCount} assigned / {summary.reserveCount} available</p>
        </div>
        <div className="mission-task-workspace__mission-state">
          <span className={`mission-task-workspace__state state-${custody.phase}`}>{mission.state}</span>
          <small>{connected ? 'C2 connected' : 'C2 offline'}</small>
        </div>
      </header>

      <div className="mission-task-workspace__overview" aria-label="Plan summary">
        <div><span>Plan groups</span><strong>{summary.groupCount}</strong></div>
        <div><span>Executing</span><strong>{summary.executingCount}</strong></div>
        <div><span>Awaiting review</span><strong>{summary.reviewCount}</strong></div>
        <div className={exceptions.length ? 'has-attention' : ''}><span>Exceptions</span><strong>{exceptions.length}</strong></div>
      </div>

      <div className="mission-task-workspace__body">
        <div className="mission-task-workspace__plan">
          <div className="mission-task-workspace__section-head">
            <div><p className="panel__eyebrow">Recommended allocation</p><strong>Task groups</strong></div>
            <span>System allocation / operator supervises</span>
          </div>

          <div className="mission-task-workspace__groups" role="listbox" aria-label="Mission task groups">
            <div className="mission-task-workspace__group-labels" aria-hidden="true">
              <span>Objective</span><span>Assets</span><span>Status</span><span>Policy</span>
            </div>
            {groups.map((group, index) => {
              const recommendation = group.recommendation
              const selected = recommendation.id === active.id
              return (
                <button
                  key={recommendation.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={[selected ? 'is-selected' : '', group.exception ? 'has-exception' : ''].filter(Boolean).join(' ')}
                  onClick={() => onSelectTask(recommendation.id, recommendation.trackId)}
                >
                  <span className="mission-task-workspace__group-name">
                    <small className="mono">GROUP {String(index + 1).padStart(2, '0')}</small>
                    <strong>{groupObjective(group.track)} {group.track.id}</strong>
                  </span>
                  <span className="mono">{recommendation.droneIds.length}</span>
                  <span>{groupStatus(recommendation)}</span>
                  <span className={`policy-${group.policyState}`}>{group.policyLabel}</span>
                </button>
              )
            })}
          </div>

          <div className="mission-task-workspace__exceptions">
            <div className="mission-task-workspace__section-head">
              <div><p className="panel__eyebrow">Attention</p><strong>{exceptions.length ? `${exceptions.length} exceptions` : 'No exceptions'}</strong></div>
              <span>{exceptions.length ? 'Review before affected groups can proceed' : 'Plan is inside current bounds'}</span>
            </div>
            {exceptions.map((group) => (
              <button key={group.recommendation.id} type="button" onClick={() => onSelectTask(group.recommendation.id, group.recommendation.trackId)}>
                <span className={`policy-${group.policyState}`}>{group.policyLabel}</span>
                <strong>{group.track.id}</strong>
                <small>{group.exception}</small>
              </button>
            ))}
          </div>
        </div>

        <aside className="mission-task-workspace__decision" aria-label="Selected group decision">
          <div className="mission-task-workspace__decision-head">
            <div>
              <p className="panel__eyebrow">Selected group</p>
              <h3>{groupObjective(selectedTrack)} {selectedTrack.id}</h3>
              <span>{active.summary}</span>
            </div>
            <span className={`policy-${selectedGroup?.policyState ?? 'within-authority'}`}>
              {selectedGroup?.policyLabel ?? 'Within authority'}
            </span>
          </div>

          <dl className="mission-task-workspace__decision-facts">
            <div><dt>Assets</dt><dd>{active.droneIds.length}</dd></div>
            <div><dt>ETA</dt><dd>{active.etaSeconds}s</dd></div>
            <div><dt>Confidence</dt><dd>{active.confidence}%</dd></div>
            <div><dt>Evidence age</dt><dd>{selectedGroup?.lastUpdateSec ?? 0}s</dd></div>
          </dl>

          <div className="mission-task-workspace__rationale">
            <strong>Why recommended</strong>
            <p>{selectedDecision.factors[0] ?? selectedDecision.roeHint}</p>
          </div>

          <button type="button" className="mission-task-workspace__asset-trigger" aria-expanded={assetDrawerOpen} onClick={() => setAssetDrawerOpen((open) => !open)}>
            <span><strong>{active.droneIds.length} assigned assets</strong><small>Inspect health or override allocation</small></span>
            <span aria-hidden="true">{assetDrawerOpen ? '-' : '+'}</span>
          </button>

          {assetDrawerOpen && (
            <div className="mission-task-workspace__asset-drawer">
              <div className="mission-task-workspace__asset-list">
                {selectedGroup?.drones.map((drone) => (
                  <button key={drone.id} type="button" className={drone.id === selectedDrone?.id ? 'is-selected' : ''} onClick={() => setSelectedAssetId(drone.id)}>
                    <strong>{drone.displayName || drone.id}</strong>
                    <small>{Math.round(drone.battery)}% / {drone.comms} link</small>
                  </button>
                ))}
              </div>
              {selectedDrone && (
                <div className="mission-task-workspace__asset-detail">
                  <div><span>Asset</span><strong>{selectedDrone.displayName || selectedDrone.id}</strong></div>
                  <div><span>Role</span><strong>{groupObjective(selectedTrack)}</strong></div>
                  <div><span>Control</span><strong>{isExecuting ? 'Autonomy' : 'Planned'}</strong></div>
                  <div><span>Positioning</span><strong>{selectedDrone.positioningMethod}</strong></div>
                </div>
              )}
              {isPending && (
                <>
                  <button type="button" className="btn btn--ghost btn--sm" aria-expanded={overrideOpen} onClick={() => setOverrideOpen((open) => !open)}>Override allocation</button>
                  {overrideOpen && (
                    <div className="mission-task-workspace__override-list">
                      {unassignedDrones.slice(0, 4).map((drone) => (
                        <button key={drone.id} type="button" disabled={switchingAssetId != null} onClick={() => void selectAsset(drone.id)}>
                          <strong>{drone.displayName || drone.id}</strong>
                          <small>{switchingAssetId === drone.id ? 'Updating...' : `${Math.round(drone.battery)}% / ${drone.comms}`}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {isExecuting && (
                <div className="mission-task-workspace__group-controls">
                  <p>Commands apply to this task group, not only the selected asset.</p>
                  <button type="button" className="btn btn--ghost-warn btn--sm" disabled={interventionBusy} onClick={() => void intervene('hold')}>Hold group</button>
                  <button type="button" className="btn btn--ghost-crit btn--sm" disabled={interventionBusy} onClick={() => void intervene('abort')}>Abort group</button>
                </div>
              )}
            </div>
          )}

          {intentOpen && lastVetoed?.id === active.id && (
            <div className="mission-task-workspace__intent" role="group" aria-label="Modify rejected task">
              <div className="mission-task-workspace__intent-head">
                <div><strong>Change this group</strong><p>Choose the intended adjustment.</p></div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onSkipIntent}>Close</button>
              </div>
              <div className="mission-task-workspace__intent-grid">
                {MODIFY_INTENTS.map((intent) => (
                  <button key={intent} type="button" className="btn btn--intent" disabled={busy} onClick={() => onApplyIntent(intent)}>{intent.replaceAll('_', ' ')}</button>
                ))}
              </div>
            </div>
          )}

          {!intentOpen && isPending && (
            <button type="button" className="btn btn--veto btn--block" disabled={busy} onClick={onReject}>Reject / change group</button>
          )}
        </aside>
      </div>

      <footer className="mission-task-workspace__footer">
        <div>
          <strong>{planApprovalArmed ? 'Confirm plan dispatch' : `${approvableIds.length} groups ready`}</strong>
          <span>{planApprovalArmed ? 'Press confirm within 5 seconds' : exceptions.length ? `${exceptions.length} groups remain in attention` : 'No policy exceptions detected'}</span>
        </div>
        <button type="button" className="btn btn--confirm" disabled={!canApprovePlan} onClick={approvePlan}>
          {busy ? 'Applying plan...' : planApprovalArmed ? `Confirm dispatch / ${approvableIds.length} groups` : `Approve plan / ${approvableIds.length} groups`}
        </button>
      </footer>
    </section>
  )
}
