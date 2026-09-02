import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { operatorSelectTrack } from '../store/threatsSlice'
import { pushToast, setActiveRecommendation } from '../store/taskingSlice'
import { holdTrackCommand } from '../store/commandThunks'
import { toggleInvestigationCollapsed } from '../store/uiSlice'
import { prioritizeThreats } from '../utils/tasking'
import { CollapsiblePanel } from './CollapsiblePanel'
import { EngageButton } from './EngageButton'
import { TrackDetail } from './TrackDetail'

function TrackRow({
  track,
  rec,
  confirmed,
  isAlert,
  isSelected,
  isActiveDecision,
  busy,
  onSelect,
  onHold,
  holdArmed,
}: {
  track: ReturnType<typeof prioritizeThreats>[number]
  rec?: { id: string; summary: string }
  confirmed?: { id: string }
  isAlert: boolean
  isSelected: boolean
  isActiveDecision: boolean
  busy: string | null
  holdArmed: string | null
  onSelect: () => void
  onHold: () => void
}) {
  const status = confirmed
    ? 'ENGAGED'
    : rec
      ? 'DECIDE'
      : track.recommendedAction.toUpperCase()

  const showEngage =
    !confirmed &&
    track.recommendedAction !== 'Hold' &&
    (rec || isSelected)

  return (
    <li
      className={[
        'object-row-wrap',
        isSelected ? 'is-selected' : '',
        isAlert ? 'is-alert' : '',
        rec ? 'is-pending' : '',
        isActiveDecision ? 'is-active-decision' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="object-row object-row--selectable"
        onClick={onSelect}
        aria-pressed={isSelected}
      >
        <div className="object-row__primary object-row__primary--tracks">
          <span className="object-row__id mono">
            <span className="symbol symbol--threat" aria-hidden="true" />
            {track.id}
          </span>
          <span className="object-row__class mono">{track.threatClass}</span>
          <span className="object-row__eta mono">
            {track.etaAvailable !== false && (
              <span
                className="object-row__eta-bar"
                style={{
                  width: `${Math.min(100, Math.max(8, ((90 - track.etaToAsset) / 90) * 100))}%`,
                }}
                aria-hidden="true"
              />
            )}
            {track.etaAvailable === false ? 'ETA N/A' : `${track.etaToAsset}s`}
          </span>
          <span
            className={[
              'object-row__state',
              rec ? 'tone-warn' : '',
              confirmed ? 'tone-ok' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {status}
          </span>
        </div>

        <div className="object-row__secondary mono">
          <span>BRG {track.bearing}°</span>
          <span>{track.speed} m/s</span>
          <span>ALT {track.altitudeAvailable === false ? 'N/A' : `${track.altitude} m`}</span>
          <span>FUS {track.sourceConfidenceAvailable === false ? 'N/A' : `${track.fusionConfidence}%`}</span>
        </div>

        {rec && isSelected && (
          <p className="object-row__summary">{rec.summary}</p>
        )}
      </button>

      {showEngage && (
        <div className="object-row__engage-bar" data-operator-ui>
          <EngageButton trackId={track.id} variant="sm" />
          <button
            type="button"
            className={[
              'btn btn--ghost-warn btn--sm',
              holdArmed === track.id ? 'btn--armed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy === track.id}
            onClick={() => onHold()}
          >
            {holdArmed === track.id ? 'Confirm hold' : 'Hold'}
          </button>
        </div>
      )}
    </li>
  )
}

export function ThreatQueue() {
  const tracks = useAppSelector((s) => s.threats.tracks)
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const activeRecommendationId = useAppSelector(
    (s) => s.tasking.activeRecommendationId,
  )
  const dispatch = useAppDispatch()
  const [busy, setBusy] = useState<string | null>(null)
  const [holdArmed, setHoldArmed] = useState<string | null>(null)
  const investigationCollapsed = useAppSelector(
    (s) => s.ui.investigationCollapsed,
  )

  const sorted = prioritizeThreats(tracks)
  const pending = recommendations.filter((r) => r.status === 'pending')
  const pendingTrackIds = new Set(pending.map((r) => r.trackId))
  const decideTracks = sorted.filter((t) => pendingTrackIds.has(t.id))
  const monitorTracks = sorted.filter((t) => !pendingTrackIds.has(t.id))

  const selectThreat = (trackId: string, recommendationId?: string) => {
    dispatch(operatorSelectTrack(trackId))
    if (recommendationId) {
      dispatch(setActiveRecommendation(recommendationId))
    }
  }

  const holdTrack = async (trackId: string) => {
    if (holdArmed !== trackId) {
      setHoldArmed(trackId)
      window.setTimeout(() => {
        setHoldArmed((prev) => (prev === trackId ? null : prev))
      }, 4500)
      return
    }
    setHoldArmed(null)
    if (busy) return
    setBusy(trackId)
    try {
      await dispatch(holdTrackCommand(trackId)).unwrap()
    } catch (error) {
      dispatch(
        pushToast(error instanceof Error ? error.message : 'Hold failed'),
      )
    } finally {
      setBusy(null)
    }
  }

  const renderTrack = (track: (typeof sorted)[number]) => {
    const rec = recommendations.find(
      (r) => r.trackId === track.id && r.status === 'pending',
    )
    const confirmed = recommendations.find(
      (r) => r.trackId === track.id && r.status === 'confirmed',
    )
    return (
      <TrackRow
        key={track.id}
        track={track}
        rec={rec}
        confirmed={confirmed}
        isAlert={alertTrackIds.includes(track.id)}
        isSelected={selectedTrackId === track.id}
        isActiveDecision={rec?.id === activeRecommendationId}
        busy={busy}
        holdArmed={holdArmed}
        onSelect={() => selectThreat(track.id, rec?.id)}
        onHold={() => void holdTrack(track.id)}
      />
    )
  }

  return (
    <CollapsiblePanel
      side="left"
      eyebrow="Investigation"
      title="Tracks"
      count={sorted.length}
      collapsed={investigationCollapsed}
      onToggleCollapse={() => dispatch(toggleInvestigationCollapsed())}
    >
      {pending.length > 0 && (
        <div className="panel__notice panel__notice--decide">
          <strong>{pending.length}</strong> ready to engage
        </div>
      )}

      {decideTracks.length > 0 && (
        <>
          <div className="panel__section-label">Decision queue</div>
          <div className="panel__list-head panel__list-head--tracks">
            <span>Object</span>
            <span>Class</span>
            <span>ETA</span>
            <span>State</span>
          </div>
          <ul className="object-list object-list--decide">
            {decideTracks.map(renderTrack)}
          </ul>
        </>
      )}

      {monitorTracks.length > 0 && (
        <>
          <div className="panel__section-label">
            {decideTracks.length > 0 ? 'Monitoring' : 'All tracks'}
          </div>
          {decideTracks.length === 0 && (
            <div className="panel__list-head panel__list-head--tracks">
              <span>Object</span>
              <span>Class</span>
              <span>ETA</span>
              <span>State</span>
            </div>
          )}
          <ul className="object-list">
            {monitorTracks.map(renderTrack)}
          </ul>
        </>
      )}

      <TrackDetail />
    </CollapsiblePanel>
  )
}
