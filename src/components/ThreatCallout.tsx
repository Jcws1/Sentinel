import { useEffect, useRef, useState } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import { useAppDispatch, useAppSelector } from '../store'
import {
  pushToast,
  setIntentPaletteOpen,
  setLastVetoedId,
} from '../store/taskingSlice'
import {
  abortEngagementCommand,
  holdTrackCommand,
  submitDecisionCommand,
} from '../store/commandThunks'
import { EngageButton } from './EngageButton'
import type { Position, ThreatTrack } from '../types'

interface ThreatCalloutProps {
  map: MapboxMap
  getPosition: () => Position | null
  track: ThreatTrack
  mode: 'hover' | 'pinned'
  onPin: () => void
  onClose: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}

export function ThreatCallout({
  map,
  getPosition,
  track,
  mode,
  onClose,
  onPointerEnter,
  onPointerLeave,
}: ThreatCalloutProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const dispatch = useAppDispatch()
  const [busy, setBusy] = useState(false)
  const [armedAction, setArmedAction] = useState<'hold' | 'abort' | 'veto' | null>(
    null,
  )

  const pending = recommendations.find(
    (r) => r.trackId === track.id && r.status === 'pending',
  )
  const engaged = recommendations.find(
    (r) => r.trackId === track.id && r.status === 'confirmed',
  )

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = rootRef.current
      const pos = getPosition()
      if (el && pos) {
        const projected = map.project([pos.lng, pos.lat])
        el.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, calc(-100% - 16px))`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, getPosition, track.id])

  const hold = async () => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(holdTrackCommand(track.id)).unwrap()
      onClose()
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Hold failed'))
    } finally {
      setBusy(false)
    }
  }

  const abort = async () => {
    if (busy) return
    setBusy(true)
    try {
      await dispatch(abortEngagementCommand(track.id)).unwrap()
      onClose()
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Abort failed'))
    } finally {
      setBusy(false)
    }
  }

  const veto = async () => {
    if (!pending || busy) return
    setBusy(true)
    try {
      await dispatch(
        submitDecisionCommand({
        recommendationId: pending.id,
        decision: 'veto',
      }),
      ).unwrap()
      dispatch(setLastVetoedId(pending.id))
      dispatch(setIntentPaletteOpen(true))
      dispatch(pushToast(`Vetoed ${track.id}`))
      onClose()
    } catch (error) {
      dispatch(pushToast(error instanceof Error ? error.message : 'Veto failed'))
    } finally {
      setBusy(false)
    }
  }

  const armThen = (action: 'hold' | 'abort' | 'veto', run: () => void) => {
    if (armedAction !== action) {
      setArmedAction(action)
      window.setTimeout(() => {
        setArmedAction((prev) => (prev === action ? null : prev))
      }, 4500)
      return
    }
    setArmedAction(null)
    run()
  }

  const isCompact = mode === 'hover'

  return (
    <div
      ref={rootRef}
      className={[
        'threat-callout',
        'map-ui-surface',
        isCompact ? 'threat-callout--hover' : 'threat-callout--pinned',
        track.threatClass === 'I' ? 'threat-callout--class-i' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={isCompact ? 'tooltip' : 'dialog'}
      aria-label={`Threat ${track.id}`}
      data-operator-ui
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="threat-callout__pointer" aria-hidden="true" />

      <header className="threat-callout__header">
        <span className="symbol symbol--threat" aria-hidden="true" />
        <span className="threat-callout__id mono">{track.id}</span>
        <span className="threat-callout__class mono">Class {track.threatClass}</span>
        {!isCompact && (
          <button
            type="button"
            className="threat-callout__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </header>

      <dl className="threat-callout__kv mono">
        <div>
          <dt>ETA</dt>
          <dd className={track.etaToAsset < 45 ? 'tone-warn' : ''}>
            {track.etaToAsset}s
          </dd>
        </div>
        <div>
          <dt>Fusion</dt>
          <dd>{track.fusionConfidence}%</dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{track.speed} m/s</dd>
        </div>
      </dl>

      {engaged ? (
        <div className="threat-callout__actions">
          <span className="threat-callout__status tone-ok">ENGAGED</span>
          <button
            type="button"
            className={[
              'btn btn--ghost-crit btn--sm',
              armedAction === 'abort' ? 'btn--armed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy}
            onClick={() => armThen('abort', () => void abort())}
          >
            {armedAction === 'abort' ? 'Confirm abort' : 'Abort'}
          </button>
        </div>
      ) : (
        <div className="threat-callout__actions threat-callout__actions--engage">
          <EngageButton
            trackId={track.id}
            variant="sm"
            onEngaged={() => onClose()}
          />
          {pending && !isCompact && (
            <button
              type="button"
              className={[
                'btn btn--ghost-warn btn--sm',
                armedAction === 'veto' ? 'btn--armed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={busy}
              onClick={() => armThen('veto', () => void veto())}
            >
              {armedAction === 'veto' ? 'Confirm veto' : 'Veto'}
            </button>
          )}
          <button
            type="button"
            className={[
              'btn btn--ghost-warn btn--sm',
              armedAction === 'hold' ? 'btn--armed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={busy}
            onClick={() => armThen('hold', () => void hold())}
          >
            {armedAction === 'hold' ? 'Confirm hold' : 'Hold'}
          </button>
        </div>
      )}

      {!isCompact && pending && (
        <p className="threat-callout__summary">{pending.summary}</p>
      )}
    </div>
  )
}
