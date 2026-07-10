import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { pushToast, setActiveRecommendation, setIntentPaletteOpen, setLastVetoedId } from '../store/taskingSlice'
import { confirmAllPendingCommand, engageTrackCommand, setMissionStateCommand, submitDecisionCommand } from '../store/commandThunks'
import { selectTrack } from '../store/threatsSlice'
import { resolveOperatorFlow } from '../api/flow'
import { getModeProfile } from '../modeProfiles'
import { setMode } from '../store/uiSlice'
import type { IntentAction } from '../types'
import { prioritizeThreats } from '../utils/tasking'
import { DefenseDecisionLane } from './tasking/DefenseDecisionLane'
import { FlowRail } from './tasking/FlowRail'
import { IntentPalette } from './tasking/IntentPalette'
import { AreaReconCard, DeniedOpsCard, SaturationCard, TargetedAttackCard, shouldShowFlowRail } from './tasking/ScenarioCards'

export function TaskingPanel() {
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const activeId = useAppSelector((s) => s.tasking.activeRecommendationId)
  const lastVetoedId = useAppSelector((s) => s.tasking.lastVetoedId)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const intentOpen = useAppSelector((s) => s.tasking.intentPaletteOpen)
  const toasts = useAppSelector((s) => s.tasking.toasts)
  const mission = useAppSelector((s) => s.mission)
  const drones = useAppSelector((s) => s.fleet.drones)
  const mode = useAppSelector((s) => s.ui.mode)
  const commands = useAppSelector((s) => s.workflow.commands)
  const dispatch = useAppDispatch()

  const [busy, setBusy] = useState(false)
  const [hotkeysArmed, setHotkeysArmed] = useState(false)
  const [confirmAllArmedUntil, setConfirmAllArmedUntil] = useState(0)
  const [authHolding, setAuthHolding] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const authTimer = useRef<number | null>(null)

  const modeProfile = getModeProfile(mode)
  const pendingCommands = Object.values(commands).filter((c) => c.status === 'pending').length

  const flow = resolveOperatorFlow({
    tracks,
    recommendations,
    activeRecommendationId: activeId,
    selectedTrackId,
  })

  const pending = recommendations
    .filter((r) => r.status === 'pending')
    .sort((a, b) => {
      const ta = tracks.find((t) => t.id === a.trackId)
      const tb = tracks.find((t) => t.id === b.trackId)
      if (!ta || !tb) return 0
      const order = prioritizeThreats([ta, tb])
      return order[0].id === ta.id ? -1 : 1
    })
  const engaged = recommendations.filter((r) => r.status === 'confirmed')

  const activeIndex = pending.findIndex((r) => r.id === activeId)
  const active = pending[activeIndex >= 0 ? activeIndex : 0] ?? pending.find((r) => r.trackId === selectedTrackId) ?? null
  const activeTrack = active ? tracks.find((t) => t.id === active.trackId) : null
  const isAlert = !!(activeTrack && alertTrackIds.includes(activeTrack.id))
  const lastVetoed = recommendations.find((r) => r.id === lastVetoedId) ?? [...recommendations].reverse().find((r) => r.status === 'vetoed')

  const showDecision = !!((flow.stage === 'decide' || flow.stage === 'recommend') && active && activeTrack)

  const selectPending = (recId: string, trackId: string) => {
    dispatch(setActiveRecommendation(recId))
    dispatch(selectTrack(trackId))
  }

  const stepPending = (delta: number) => {
    if (pending.length < 2) return
    const idx = pending.findIndex((r) => r.id === active?.id)
    const next = (idx + delta + pending.length) % pending.length
    selectPending(pending[next].id, pending[next].trackId)
  }

  const vetoRec = async () => {
    if (!active || busy) return
    setBusy(true)
    try {
      await dispatch(submitDecisionCommand({ recommendationId: active.id, decision: 'veto' })).unwrap()
      dispatch(setLastVetoedId(active.id))
      dispatch(setIntentPaletteOpen(true))
      dispatch(pushToast(`Vetoed ${active.trackId}`))
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Veto failed'))
    } finally {
      setBusy(false)
    }
  }

  const confirmAll = async () => {
    if (busy) return
    if (Date.now() > confirmAllArmedUntil) {
      setConfirmAllArmedUntil(Date.now() + 5000)
      dispatch(pushToast('Press Confirm all again to execute'))
      return
    }
    setBusy(true)
    try {
      await dispatch(confirmAllPendingCommand(pending.map((rec) => rec.id))).unwrap()
      setConfirmAllArmedUntil(0)
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Confirm all failed'))
    } finally {
      setBusy(false)
    }
  }

  const applyIntentAction = async (intent: IntentAction) => {
    if (!lastVetoed || busy) return
    setBusy(true)
    try {
      await dispatch(
        submitDecisionCommand({
          recommendationId: lastVetoed.id,
          decision: 'veto',
          intent,
        }),
      ).unwrap()
      dispatch(setIntentPaletteOpen(false))
      dispatch(setLastVetoedId(null))
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Intent failed'))
    } finally {
      setBusy(false)
    }
  }

  const clearAuthTimer = () => {
    if (authTimer.current) {
      window.clearTimeout(authTimer.current)
      authTimer.current = null
    }
    setAuthHolding(false)
  }

  const authorizeActiveTarget = async () => {
    if (!active || busy) return
    setBusy(true)
    try {
      await dispatch(engageTrackCommand(active.trackId)).unwrap()
      dispatch(pushToast(`Strike authorized: ${active.trackId}`))
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Authorize failed'))
    } finally {
      setBusy(false)
      clearAuthTimer()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (intentOpen) {
        if (e.key === 'Escape') {
          dispatch(setIntentPaletteOpen(false))
          dispatch(setLastVetoedId(null))
        }
        return
      }
      if (!active || busy || !hotkeysArmed) return
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault()
        void dispatch(engageTrackCommand(active.trackId))
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        void vetoRec()
      }
      if (e.key === 'ArrowLeft' || e.key === '[') {
        e.preventDefault()
        stepPending(-1)
      }
      if (e.key === 'ArrowRight' || e.key === ']') {
        e.preventDefault()
        stepPending(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intentOpen, active, busy, hotkeysArmed])

  const scoutCount = drones.filter((d) => d.type === 'Scout').length
  const avgScoutBattery =
    scoutCount > 0
      ? Math.round(drones.filter((d) => d.type === 'Scout').reduce((sum, d) => sum + d.battery, 0) / scoutCount)
      : 0
  const avgConfidence = tracks.length > 0 ? Math.round(tracks.reduce((sum, t) => sum + t.fusionConfidence, 0) / tracks.length) : 0
  const decoyEstimate = tracks.filter((t) => t.threatClass === 'III').length
  const lowInterceptors = drones.filter((d) => d.type === 'Interceptor' && d.battery < 35).length
  const deniedRisk = mission.gnss === 'denied' || mission.c2Link === 'lost'

  const primaryLane =
    mode === 'defense' && showDecision && active && activeTrack
      ? pending.length > 5
        ? (
            <SaturationCard
              mission={modeProfile.label}
              pendingCount={pending.length}
              decoyEstimate={decoyEstimate}
              lowInterceptors={lowInterceptors}
              busy={busy}
              hasActive={!!active}
              onBatchConfirm={() => void confirmAll()}
              onVeto={() => void vetoRec()}
              onIgnoreDecoys={() => void applyIntentAction('IGNORE')}
            />
          )
        : (
            <DefenseDecisionLane
              pending={pending}
              active={active}
              activeTrack={activeTrack}
              activeIndex={activeIndex}
              isAlert={isAlert}
              busy={busy}
              confirmAllArmedUntil={confirmAllArmedUntil}
              hotkeysArmed={hotkeysArmed}
              onSelectPending={selectPending}
              onStepPending={stepPending}
              onVeto={() => void vetoRec()}
              onConfirmAll={() => void confirmAll()}
            />
          )
      : mode === 'defense' && flow.stage === 'execute' && engaged.length > 0
        ? (
            <div className="execute-chip map-ui-surface" role="status">
              <span className="panel__eyebrow">Execute</span>
              <span>{engaged.map((r) => `${r.trackId} ← ${r.droneIds.join(', ')}`).join(' · ')}</span>
            </div>
          )
        : mode === 'defense' && pending.length === 0
          ? (
              <div className="standby-chip map-ui-surface" role="status">
                <span className="panel__eyebrow">Detect</span>
                <span>{flow.detail}</span>
                <span className="standby-chip__hint">
                  Select a track and request a plan, or wait for auto-recommendation
                </span>
              </div>
            )
          : mode === 'recon'
            ? (
                <AreaReconCard
                  mission={modeProfile.label}
                  scoutCount={scoutCount}
                  avgScoutBattery={avgScoutBattery}
                  onAssign={() => dispatch(pushToast('Assigned next block to Scout-01'))}
                  onMark={() => dispatch(pushToast('POI classified: HOSTILE'))}
                  onHandoff={() => {
                    dispatch(pushToast('Hostile prep detected — switch to DEFENSE?'))
                    dispatch(setMode('defense'))
                  }}
                />
              )
            : mode === 'attack'
              ? (
                  <TargetedAttackCard
                    mission={modeProfile.label}
                    label={
                      active
                        ? `Target ${active.trackId} · Source confidence ${active.confidence}%`
                        : 'Select a target recommendation to authorize strike.'
                    }
                    authHolding={authHolding}
                    disabled={!active || busy}
                    onStartAuth={() => {
                      if (!active || busy) return
                      setAuthHolding(true)
                      authTimer.current = window.setTimeout(() => {
                        void authorizeActiveTarget()
                      }, 3000)
                    }}
                    onStopAuth={clearAuthTimer}
                    onEscalate={() => dispatch(pushToast('Commander escalation requested'))}
                  />
                )
              : null

  return (
    <div
      ref={rootRef}
      className="map-ui-layer"
      data-operator-ui
      data-mode={mode}
      onPointerEnter={() => setHotkeysArmed(true)}
      onPointerLeave={() => setHotkeysArmed(false)}
      onFocusCapture={() => setHotkeysArmed(true)}
      onBlurCapture={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setHotkeysArmed(false)
      }}
    >
      {shouldShowFlowRail(mode) && <FlowRail stage={flow.stage} pendingCount={pending.length} />}
      {deniedRisk && (
        <DeniedOpsCard
          mission="Degraded overlay"
          avgConfidence={avgConfidence}
          positioning={mission.fallbackPositioning ?? 'GNSS'}
          deniedRisk={deniedRisk}
          onCheckMesh={() => dispatch(pushToast('Mesh health checked: degraded links detected'))}
          onRecall={() => void dispatch(setMissionStateCommand('RECALL'))}
        />
      )}
      {pendingCommands > 0 && <div className="command-health-chip map-ui-surface mono">SYNC {pendingCommands}</div>}
      <div className="tasking-primary-lane">{primaryLane}</div>

      {intentOpen && lastVetoed && (
        <IntentPalette
          lastVetoed={lastVetoed}
          busy={busy}
          onApplyIntent={(intent) => void applyIntentAction(intent)}
          onSkip={() => {
            dispatch(setIntentPaletteOpen(false))
            dispatch(setLastVetoedId(null))
          }}
        />
      )}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
