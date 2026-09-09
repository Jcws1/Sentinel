import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { engageTrackCommand } from '../store/commandThunks'

export type EngageButtonVariant = 'sm' | 'confirm' | 'block'

interface EngageButtonProps {
  trackId: string
  variant?: EngageButtonVariant
  className?: string
  label?: string
  disabled?: boolean
  onEngaged?: (droneIds: string[]) => void
  onError?: (message: string) => void
}

export function EngageButton({
  trackId,
  variant = 'confirm',
  className = '',
  label: idleLabel = 'Engage',
  disabled: externallyDisabled = false,
  onEngaged,
  onError,
}: EngageButtonProps) {
  const dispatch = useAppDispatch()
  const recommendations = useAppSelector((s) => s.tasking.recommendations)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const mission = useAppSelector((s) => s.mission)
  const [busy, setBusy] = useState(false)
  const inFlightRef = useRef(false)

  const track = tracks.find((t) => t.id === trackId)
  const engaged = recommendations.find(
    (r) => r.trackId === trackId && r.status === 'confirmed',
  )
  const pending = recommendations.find(
    (r) => r.trackId === trackId && r.status === 'pending',
  )

  const missionBlocked =
    mission.state === 'HOLD' || mission.state === 'RECALL'
  const onHold = track?.recommendedAction === 'Hold'
  const replayAuthorizationAvailable = Boolean(track?.sourceScenario)
  const disabled =
    externallyDisabled || busy || !!engaged || (onHold && !replayAuthorizationAvailable) || missionBlocked || !track

  useEffect(() => {
    if (engaged) setBusy(false)
  }, [engaged])

  const effectiveIdleLabel = onHold && replayAuthorizationAvailable
    ? idleLabel === 'Engage' ? 'Authorize & engage' : `Authorize & ${idleLabel.toLowerCase()}`
    : idleLabel

  const label = busy
    ? 'Engaging…'
    : engaged
      ? 'Engaged'
      : pending
        ? effectiveIdleLabel
        : effectiveIdleLabel

  const variantClass =
    variant === 'sm'
      ? 'btn btn--confirm btn--sm'
      : variant === 'block'
        ? 'btn btn--confirm btn--block'
        : 'btn btn--confirm'

  const engage = async () => {
    if (disabled || inFlightRef.current) return
    inFlightRef.current = true
    setBusy(true)
    try {
      const result = await dispatch(engageTrackCommand(trackId)).unwrap()
      onEngaged?.(result.droneIds)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Engage failed'
      onError?.(message)
      setBusy(false)
    } finally {
      inFlightRef.current = false
    }
  }

  if (!track) return null

  return (
    <button
      type="button"
      className={[variantClass, className, engaged ? 'btn--engaged' : '']
        .filter(Boolean)
        .join(' ')}
      data-operator-ui
      disabled={disabled}
      aria-label={engaged ? `${trackId} engaged` : `${effectiveIdleLabel} ${trackId}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        void engage()
      }}
    >
      {label}
    </button>
  )
}
