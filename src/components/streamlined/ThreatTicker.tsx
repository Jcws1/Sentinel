import { useAppDispatch, useAppSelector } from '../../store'
import {
  selectPendingCount,
  selectTopPriorityPending,
  selectTopPriorityTrack,
} from '../../store/selectors'
import { operatorSelectTrack } from '../../store/threatsSlice'
import { setActiveRecommendation } from '../../store/taskingSlice'

function threatPhase(
  track: { etaToAsset: number; recommendedAction: string },
  isAlert: boolean,
  hasPending: boolean,
): string {
  if (isAlert || hasPending) return 'inbound'
  if (track.recommendedAction.toLowerCase().includes('hold')) return 'held'
  return 'monitoring'
}

export function ThreatTicker() {
  const dispatch = useAppDispatch()
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const trackCount = useAppSelector((s) => s.threats.tracks.length)
  const alertCount = alertTrackIds.length
  const pendingCount = useAppSelector(selectPendingCount)
  const topRec = useAppSelector(selectTopPriorityPending)
  const topTrack = useAppSelector(selectTopPriorityTrack)

  if (trackCount === 0) return null
  if (pendingCount === 0 && alertCount === 0) return null
  if (!topTrack) return null

  const isAlert = alertTrackIds.includes(topTrack.id)
  const hasPending = topRec?.trackId === topTrack.id
  const phase = threatPhase(topTrack, isAlert, hasPending)
  const eta = Math.max(0, Math.round(topTrack.etaToAsset))

  return (
    <button
      type="button"
      className={[
        'v4-threat-ticker',
        isAlert ? 'is-alert' : '',
        hasPending ? 'is-pending' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Focus threat ${topTrack.id}, ${phase}, ${eta} seconds to asset`}
      onClick={() => {
        dispatch(operatorSelectTrack(topTrack.id))
        if (topRec) dispatch(setActiveRecommendation(topRec.id))
      }}
      data-operator-ui
    >
      {isAlert && <span className="v4-threat-ticker__dot" aria-hidden />}
      <span className="v4-threat-ticker__id mono">{topTrack.id}</span>
      <span className="v4-threat-ticker__sep">·</span>
      <span className="v4-threat-ticker__phase">{phase}</span>
      <span className="v4-threat-ticker__sep">·</span>
      <span className="v4-threat-ticker__eta mono">{eta}s</span>
    </button>
  )
}
