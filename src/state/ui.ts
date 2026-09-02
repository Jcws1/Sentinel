import { createStore, useStoreSelector } from './createStore'
import type { ViewId } from '@/app/views'

export interface UiState {
  /** Which rail slot is active. Drives the panel layer, never the map. */
  activeView: ViewId
  /** Rail slots can be toggled off to hand the full viewport back to the map. */
  panelVisible: boolean
}

export const uiStore = createStore<UiState>({
  activeView: 'home',
  panelVisible: true,
})

export function useActiveView() {
  return useStoreSelector(uiStore, (s) => s.activeView)
}

export function usePanelVisible() {
  return useStoreSelector(uiStore, (s) => s.panelVisible)
}

/**
 * Selecting the already-active slot collapses the panel layer, the way a
 * VS Code activity-bar item toggles its sidebar. An operator clearing the
 * screen to see the map is a one-click action, not a hunt for a close button.
 */
export function selectView(id: ViewId) {
  const { activeView, panelVisible } = uiStore.get()

  if (activeView === id) {
    uiStore.set({ activeView, panelVisible: !panelVisible })
    return
  }

  uiStore.set({ activeView: id, panelVisible: true })
}

export function setPanelVisible(visible: boolean) {
  // Bail before constructing a new object: the store compares by identity, so
  // a spread would notify every subscriber even when nothing changed.
  if (uiStore.get().panelVisible === visible) return
  uiStore.set((s) => ({ ...s, panelVisible: visible }))
}
