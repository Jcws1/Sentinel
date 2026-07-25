import { useEffect, useState } from 'react'
import { getOfflinePrepStatus, type OfflinePrepStatus } from '../offline/offlinePrep'

const POLL_MS = 15_000

export function useOfflineCacheStatus(enabled: boolean) {
  const [status, setStatus] = useState<OfflinePrepStatus | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus(null)
      return
    }
    let cancelled = false
    const refresh = () => {
      void getOfflinePrepStatus().then((s) => {
        if (!cancelled) setStatus(s)
      })
    }
    refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled])

  const coveragePct =
    status && status.estimatedTiles > 0
      ? Math.min(100, Math.round((status.tileCount / status.estimatedTiles) * 100))
      : null

  const cacheIncomplete =
    coveragePct != null && coveragePct < 80 && status!.estimatedTiles > 0

  return { status, coveragePct, cacheIncomplete }
}
