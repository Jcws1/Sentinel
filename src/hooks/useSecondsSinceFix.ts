import { useEffect, useState } from 'react'

/** Live seconds since last C2/GNSS sync — ticks every second in degraded ops. */
export function useSecondsSinceFix(
  lastSyncAt: number | null,
  gnssDegraded: boolean,
): number {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const tick = () => {
      if (!lastSyncAt) {
        setSeconds(gnssDegraded ? 60 : 0)
        return
      }
      setSeconds(Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000)))
    }
    tick()
    if (!gnssDegraded && lastSyncAt) return
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [lastSyncAt, gnssDegraded])

  return seconds
}
