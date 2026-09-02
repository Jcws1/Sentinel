import { createStore, useStoreValue } from './createStore'
import { DEFAULT_CURSOR_MODE, type CursorModeId } from '@/map/cursorModes'

/**
 * The active cursor mode.
 *
 * Kept in its own store rather than folded into `uiStore` because the map will
 * read this on every pointer event once MapCanvas lands. Separating it means a
 * mode change never notifies subscribers of unrelated UI state, and vice
 * versa — a panel opening must not invalidate a map drag handler.
 */
export const cursorModeStore = createStore<CursorModeId>(DEFAULT_CURSOR_MODE)

export function useCursorMode() {
  return useStoreValue(cursorModeStore)
}

export function setCursorMode(id: CursorModeId) {
  cursorModeStore.set(id)
}

/** Returns true if it actually changed anything — lets Escape fall through. */
export function resetCursorMode(): boolean {
  if (cursorModeStore.get() === DEFAULT_CURSOR_MODE) return false
  cursorModeStore.set(DEFAULT_CURSOR_MODE)
  return true
}
