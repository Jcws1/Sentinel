import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import {
  selectAutoFocusKey,
  selectTopPriorityPending,
  selectTopPriorityTrack,
} from '../store/selectors'
import { selectTrack } from '../store/threatsSlice'
import { setActiveRecommendation } from '../store/taskingSlice'

const MANUAL_SELECT_GRACE_MS = 8000

/**
 * Keeps tasking pinned to the highest-priority threat without fighting operator picks.
 */
export function useTopPriorityThreatFocus() {
  const dispatch = useAppDispatch()
  const autoFocusKey = useAppSelector(selectAutoFocusKey)
  const topRec = useAppSelector(selectTopPriorityPending)
  const topTrack = useAppSelector(selectTopPriorityTrack)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const activeRecommendationId = useAppSelector(
    (s) => s.tasking.activeRecommendationId,
  )
  const lastManualSelectAt = useAppSelector((s) => s.threats.lastManualSelectAt)
  const trackCount = useAppSelector((s) => s.threats.tracks.length)
  const lastAppliedKeyRef = useRef('')
  const prevManualAtRef = useRef(lastManualSelectAt)

  useEffect(() => {
    if (lastManualSelectAt !== prevManualAtRef.current) {
      lastAppliedKeyRef.current = ''
      prevManualAtRef.current = lastManualSelectAt
    }
    if (trackCount === 0) return
    if (Date.now() - lastManualSelectAt < MANUAL_SELECT_GRACE_MS) return
    if (autoFocusKey === lastAppliedKeyRef.current) return
    lastAppliedKeyRef.current = autoFocusKey

    if (topRec && topRec.id !== activeRecommendationId) {
      dispatch(setActiveRecommendation(topRec.id))
    }

    const focusId = topRec?.trackId ?? topTrack?.id ?? null
    if (focusId && focusId !== selectedTrackId) {
      dispatch(selectTrack(focusId))
    }
  }, [
    autoFocusKey,
    topRec,
    topTrack,
    selectedTrackId,
    activeRecommendationId,
    lastManualSelectAt,
    trackCount,
    dispatch,
  ])
}
