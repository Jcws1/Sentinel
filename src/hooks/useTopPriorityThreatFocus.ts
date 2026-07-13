import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { selectTrack } from '../store/threatsSlice'
import { setActiveRecommendation } from '../store/taskingSlice'
import {
  getTopPriorityPendingRecommendation,
  getTopPriorityTrack,
} from '../utils/tasking'

const MANUAL_SELECT_GRACE_MS = 8000

/**
 * Keeps map selection + active tasking pinned to the highest-priority threat.
 * Alerts beat class/ETA; CONFIRM always targets #1.
 */
export function useTopPriorityThreatFocus() {
  const dispatch = useAppDispatch()
  const tracks = useAppSelector((s) => s.threats.tracks)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const lastManualSelectAt = useAppSelector((s) => s.threats.lastManualSelectAt)

  useEffect(() => {
    if (tracks.length === 0) return
    if (Date.now() - lastManualSelectAt < MANUAL_SELECT_GRACE_MS) return

    const topRec = getTopPriorityPendingRecommendation(
      tracks,
      alertTrackIds,
      recommendations,
    )
    const topTrack = getTopPriorityTrack(tracks, alertTrackIds)

    if (topRec) {
      dispatch(setActiveRecommendation(topRec.id))
    }

    const focusId = topRec?.trackId ?? topTrack?.id ?? null
    if (focusId && focusId !== selectedTrackId) {
      dispatch(selectTrack(focusId))
    }
  }, [
    tracks,
    alertTrackIds,
    recommendations,
    selectedTrackId,
    lastManualSelectAt,
    dispatch,
  ])
}
