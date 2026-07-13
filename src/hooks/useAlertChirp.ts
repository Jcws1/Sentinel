import { useEffect, useRef } from 'react'
import { useAppSelector } from '../store'
import { playAlertChirp } from '../utils/alertChirp'

/** Plays one chirp when a new alert track appears (if enabled in settings). */
export function useAlertChirp() {
  const enabled = useAppSelector((s) => s.ui.alertChirpEnabled)
  const alertTrackIds = useAppSelector((s) => s.threats.alertTrackIds)
  const prevRef = useRef<string[]>([])

  useEffect(() => {
    if (!enabled) {
      prevRef.current = alertTrackIds
      return
    }

    const prev = new Set(prevRef.current)
    const added = alertTrackIds.filter((id) => !prev.has(id))
    prevRef.current = alertTrackIds

    if (added.length > 0) {
      playAlertChirp()
    }
  }, [alertTrackIds, enabled])
}
