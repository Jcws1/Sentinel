import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import {
  selectThreatPriorityKey,
  selectTopPriorityPending,
  selectTopPriorityTrack,
} from '../store/selectors'
import { selectTrack } from '../store/threatsSlice'
import { setActiveRecommendation } from '../store/taskingSlice'

const MANUAL_SELECT_GRACE_MS = 8000

/**
 * Keeps map selection + active tasking pinned to the highest-priority threat.
 * Alerts beat class/ETA; CONFIRM always targets #1.
 */
export function useTopPriorityThreatFocus() {
  const dispatch = useAppDispatch()
  const priorityKey = useAppSelector(selectThreatPriorityKey)
  const topRec = useAppSelector(selectTopPriorityPending)
  const topTrack = useAppSelector(selectTopPriorityTrack)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const activeRecommendationId = useAppSelector(
    (s) => s.tasking.activeRecommendationId,
  )
  const lastManualSelectAt = useAppSelector((s) => s.threats.lastManualSelectAt)
  const trackCount = useAppSelector((s) => s.threats.tracks.length)

  useEffect(() => {
    if (trackCount === 0) return
    if (Date.now() - lastManualSelectAt < MANUAL_SELECT_GRACE_MS) return

    if (topRec && topRec.id !== activeRecommendationId) {
      dispatch(setActiveRecommendation(topRec.id))
    }

    const focusId = topRec?.trackId ?? topTrack?.id ?? null
    if (focusId && focusId !== selectedTrackId) {
      dispatch(selectTrack(focusId))
    }
  }, [
    priorityKey,
    topRec,
    topTrack,
    selectedTrackId,
    activeRecommendationId,
    lastManualSelectAt,
    trackCount,
    dispatch,
  ])
}
