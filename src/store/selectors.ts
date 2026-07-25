import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './index'
import {
  getTopPriorityPendingRecommendation,
  getTopPriorityTrack,
} from '../utils/tasking'
import {
  assessDecisionContext,
  assessDecisionEvidence,
} from '../utils/decision'

const STALE_DATA_SEC = 5
const CRITICAL_STALE_SEC = 12

export const selectDataAgeSec = createSelector(
  [(s: RootState) => s.session.lastSyncAt],
  (lastSyncAt) =>
    lastSyncAt != null
      ? Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000))
      : null,
)

export const selectIsDataStale = createSelector(
  [selectDataAgeSec],
  (age) => age != null && age > STALE_DATA_SEC,
)

export const selectIsDataCriticallyStale = createSelector(
  [selectDataAgeSec],
  (age) => age != null && age > CRITICAL_STALE_SEC,
)

export const selectQueuedCommandCount = createSelector(
  [(s: RootState) => s.commandQueue.queue],
  (queue) => queue.filter((c) => c.status === 'queued' || c.status === 'sending').length,
)

export const selectFailedQueuedCount = createSelector(
  [(s: RootState) => s.commandQueue.queue],
  (queue) => queue.filter((c) => c.status === 'failed').length,
)

export const selectPendingWorkflowCommands = createSelector(
  [(s: RootState) => s.workflow.commands],
  (commands) =>
    Object.values(commands).filter((c) => c.status === 'pending'),
)

export const selectPendingRecommendations = createSelector(
  [(s: RootState) => s.tasking.recommendations],
  (recommendations) => recommendations.filter((r) => r.status === 'pending'),
)

export const selectTopPriorityPending = createSelector(
  [
    (s: RootState) => s.threats.tracks,
    (s: RootState) => s.threats.alertTrackIds,
    (s: RootState) => s.tasking.recommendations,
  ],
  (tracks, alertTrackIds, recommendations) =>
    getTopPriorityPendingRecommendation(tracks, alertTrackIds, recommendations),
)

export const selectDecisionEvidenceForActive = createSelector(
  [
    selectTopPriorityPending,
    (s: RootState) => s.threats.tracks,
    (s: RootState) => s.mission.protectedAsset,
    (s: RootState) => s.policy.zones,
    (s: RootState) => s.session.lastSyncAt,
  ],
  (active, tracks, asset, zones, lastSyncAt) => {
    if (!active) return null
    const track = tracks.find((t) => t.id === active.trackId)
    if (!track) return null
    const evidence = assessDecisionEvidence(track, asset, zones, lastSyncAt)
    const context = assessDecisionContext(track)
    return { track, evidence, context, active }
  },
)

export const selectConfirmReadiness = createSelector(
  [
    selectTopPriorityPending,
    selectDecisionEvidenceForActive,
    selectIsDataCriticallyStale,
    (s: RootState) => s.session.connected,
    (s: RootState) => s.mission.state,
  ],
  (active, decision, criticallyStale, connected, missionState) => {
    if (!active || !decision) {
      return {
        ready: false,
        blocked: true,
        reasons: ['No pending tasking'],
        warnOnly: false,
      }
    }
    const reasons: string[] = [...decision.context.factors]
    if (!decision.evidence.roePass) {
      reasons.push('ROE caution — manual review required')
    }
    if (decision.evidence.lastUpdateSec != null && decision.evidence.lastUpdateSec > STALE_DATA_SEC) {
      reasons.push(`Data ${decision.evidence.lastUpdateSec}s old`)
    }
    if (!connected) {
      reasons.push('C2 offline — commands will queue')
    }
    if (missionState === 'HOLD') {
      return { ready: false, blocked: true, reasons: ['Mission on HOLD'], warnOnly: false }
    }
    const blocked = criticallyStale || (!decision.evidence.roePass && decision.track.threatClass === 'I')
    const warnOnly = !blocked && (decision.evidence.lastUpdateSec ?? 0) > STALE_DATA_SEC
    return {
      ready: !blocked,
      blocked,
      reasons,
      warnOnly,
    }
  },
)

export const selectPendingCount = createSelector(
  [selectPendingRecommendations],
  (pending) => pending.length,
)

export const selectEngagedCount = createSelector(
  [(s: RootState) => s.tasking.recommendations],
  (recommendations) =>
    recommendations.filter((r) => r.status === 'confirmed').length,
)

export const selectTopPriorityTrack = createSelector(
  [
    (s: RootState) => s.threats.tracks,
    (s: RootState) => s.threats.alertTrackIds,
  ],
  (tracks, alertTrackIds) => getTopPriorityTrack(tracks, alertTrackIds),
)

export const selectSelectedDrone = createSelector(
  [
    (s: RootState) => s.fleet.drones,
    (s: RootState) => s.fleet.selectedDroneId,
  ],
  (drones, selectedId) =>
    selectedId ? (drones.find((d) => d.id === selectedId) ?? null) : null,
)

export const selectAlertTrackIdSet = createSelector(
  [(s: RootState) => s.threats.alertTrackIds],
  (ids) => new Set(ids),
)

/** Stable focus target — only changes when #1 threat/rec actually changes. */
export const selectAutoFocusKey = createSelector(
  [
    (s: RootState) => s.threats.tracks.map((t) => t.id).join(','),
    (s: RootState) => s.threats.alertTrackIds.join(','),
    selectPendingRecommendations,
    selectTopPriorityPending,
    selectTopPriorityTrack,
  ],
  (trackIds, alerts, pending, topRec, topTrack) => {
    const focusId = topRec?.trackId ?? topTrack?.id ?? ''
    return `${trackIds}|${alerts}|${pending.map((r) => r.id).join(',')}|${topRec?.id ?? ''}|${focusId}`
  },
)
