import { useCallback, useRef } from 'react'

interface Options {
  onTap: () => void
  onLongPress: () => void
  ms?: number
}

/** Pointer long-press helpers for emergency buttons (≥48px targets). */
export function useLongPress({ onTap, onLongPress, ms = 2000 }: Options) {
  const timer = useRef<number | null>(null)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const onPointerDown = useCallback(() => {
    fired.current = false
    clear()
    timer.current = window.setTimeout(() => {
      fired.current = true
      onLongPress()
    }, ms)
  }, [clear, ms, onLongPress])

  const onPointerUp = useCallback(() => {
    clear()
    if (!fired.current) onTap()
  }, [clear, onTap])

  const onPointerLeave = useCallback(() => {
    clear()
  }, [clear])

  return {
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel: onPointerLeave,
  }
}
