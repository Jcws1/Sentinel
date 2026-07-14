import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './index'
import {
  getTopPriorityPendingRecommendation,
  getTopPriorityTrack,
} from '../utils/tasking'

export const selectPendingRecommendations = createSelector(
  [(s: RootState) => s.tasking.recommendations],
  (recommendations) => recommendations.filter((r) => r.status === 'pending'),
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

export const selectTopPriorityPending = createSelector(
  [
    (s: RootState) => s.threats.tracks,
    (s: RootState) => s.threats.alertTrackIds,
    (s: RootState) => s.tasking.recommendations,
  ],
  (tracks, alertTrackIds, recommendations) =>
    getTopPriorityPendingRecommendation(tracks, alertTrackIds, recommendations),
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
