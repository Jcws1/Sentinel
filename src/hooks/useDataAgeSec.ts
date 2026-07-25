import { useEffect, useState } from 'react'

/** Ticking data age in seconds for HUD display. */
export function useDataAgeSec(lastSyncAt: number | null): number | null {
  const [age, setAge] = useState<number | null>(() =>
    lastSyncAt != null ? Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000)) : null,
  )

  useEffect(() => {
    const tick = () => {
      setAge(
        lastSyncAt != null
          ? Math.max(0, Math.round((Date.now() - lastSyncAt) / 1000))
          : null,
      )
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [lastSyncAt])

  return age
}
