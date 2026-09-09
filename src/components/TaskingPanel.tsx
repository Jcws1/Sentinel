import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { pushToast, setActiveRecommendation, setIntentPaletteOpen, setLastVetoedId } from '../store/taskingSlice'
import { confirmAllPendingCommand, engageTrackCommand, setMissionStateCommand, submitDecisionCommand } from '../store/commandThunks'
import { operatorSelectTrack } from '../store/threatsSlice'
import { resolveOperatorFlow } from '../api/flow'
import { getModeProfile } from '../modeProfiles'
import { setMode } from '../store/uiSlice'
import type { IntentAction } from '../types'
import { prioritizeThreats } from '../utils/tasking'
import { AreaReconCard, DeniedOpsCard, TargetedAttackCard } from './tasking/ScenarioCards'
import { MissionTaskWorkspace } from './tasking/MissionTaskWorkspace'

export function TaskingPanel() {
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const activeId = useAppSelector((s) => s.tasking.activeRecommendationId)
  const lastVetoedId = useAppSelector((s) => s.tasking.lastVetoedId)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
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
  const lastVetoed = recommendations.find((r) => r.id === lastVetoedId) ?? [...recommendations].reverse().find((r) => r.status === 'vetoed') ?? null
  const selectedPending = pending.find((r) => r.trackId === selectedTrackId) ?? null
  const selectedEngaged = engaged.find((r) => r.trackId === selectedTrackId) ?? null
  const activePending = pending.find((r) => r.id === activeId) ?? pending[0] ?? null
  const activeEngaged = engaged.find((r) => r.id === activeId) ?? engaged[0] ?? null
  const activeById =
    recommendations.find(
      (recommendation) =>
        recommendation.id === activeId &&
        (recommendation.status === 'pending' ||
          recommendation.status === 'confirmed' ||
          recommendation.status === 'auto-executing'),
    ) ?? null
  const active =
    intentOpen && lastVetoed
      ? lastVetoed
      : activeById ?? selectedPending ?? selectedEngaged ?? activePending ?? activeEngaged
  const activeTrack = active ? tracks.find((t) => t.id === active.trackId) : null

  const selectTask = (recId: string, trackId: string) => {
    dispatch(setActiveRecommendation(recId))
    dispatch(operatorSelectTrack(trackId))
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

  const approvePlan = async (recommendationIds: string[]) => {
    if (busy || recommendationIds.length === 0) return
    setBusy(true)
    try {
      await dispatch(confirmAllPendingCommand(recommendationIds)).unwrap()
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Plan approval failed'))
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

  const onOperatorKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if (intentOpen) {
      if (event.key === 'Escape') {
        dispatch(setIntentPaletteOpen(false))
        dispatch(setLastVetoedId(null))
      }
      return
    }
    if (!active || active.status !== 'pending' || busy || !hotkeysArmed) return
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      event.preventDefault()
      void dispatch(engageTrackCommand(active.trackId))
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      void vetoRec()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onOperatorKey)
    return () => window.removeEventListener('keydown', onOperatorKey)
  }, [])

  const scoutCount = drones.filter((d) => d.type === 'Scout').length
  const avgScoutBattery =
    scoutCount > 0
      ? Math.round(drones.filter((d) => d.type === 'Scout').reduce((sum, d) => sum + d.battery, 0) / scoutCount)
      : 0
  const avgConfidence = tracks.length > 0 ? Math.round(tracks.reduce((sum, t) => sum + t.fusionConfidence, 0) / tracks.length) : 0
  const deniedRisk = mission.gnss === 'denied' || mission.c2Link === 'lost'
  const cinematicMap = new URLSearchParams(window.location.search).get('view') === 'cinematic'

  const primaryLane =
    cinematicMap && engaged.length > 0
      ? (
          <div className="standby-chip map-ui-surface" role="status">
            <span className="panel__eyebrow">Blue team intercept</span>
            <span>{engaged.length} Thales groups tasked</span>
            <span className="standby-chip__hint">3D tactical view · interceptors executing</span>
          </div>
        )
      : mode === 'defense' && active && activeTrack
      ? (
          <MissionTaskWorkspace
            pending={pending}
            engaged={engaged}
            active={active}
            activeTrack={activeTrack}
            busy={busy}
            intentOpen={intentOpen}
            lastVetoed={lastVetoed}
            onSelectTask={selectTask}
            onApprovePlan={(recommendationIds) => void approvePlan(recommendationIds)}
            onReject={() => void vetoRec()}
            onApplyIntent={(intent) => void applyIntentAction(intent)}
            onSkipIntent={() => {
              dispatch(setIntentPaletteOpen(false))
              dispatch(setLastVetoedId(null))
            }}
          />
        )
      : mode === 'defense' && pending.length === 0 && engaged.length === 0
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
