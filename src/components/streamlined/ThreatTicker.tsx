import { useAppDispatch, useAppSelector } from '../../store'
import { operatorSelectTrack } from '../../store/threatsSlice'
import { setActiveRecommendation } from '../../store/taskingSlice'
import {
  getTopPriorityPendingRecommendation,
  getTopPriorityTrack,
} from '../../utils/tasking'

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
  const tracks = useAppSelector((s) => s.threats.tracks)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const pending = recommendations.filter((r) => r.status === 'pending')

  const topRec = getTopPriorityPendingRecommendation(
    tracks,
    alertTrackIds,
    recommendations,
  )
  const topTrack = getTopPriorityTrack(tracks, alertTrackIds)

  if (tracks.length === 0) return null
  // Collapse when idle — no pending tasking and no alerts.
  if (pending.length === 0 && alertTrackIds.length === 0) return null
  if (!topTrack) return null

  const isAlert = alertTrackIds.includes(topTrack.id)
  const hasPending = pending.some((r) => r.trackId === topTrack.id)
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
        const rec =
          topRec ??
          recommendations.find(
            (r) => r.trackId === topTrack.id && r.status === 'pending',
          )
        if (rec) dispatch(setActiveRecommendation(rec.id))
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
