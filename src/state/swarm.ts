import { createStore, useStoreSelector } from './createStore'

/* ===========================================================================
   SWARM PANEL STATE

   Deliberately separate from uiStore. The rail routes the left panel; this
   dock is its own surface and the two are open at the same time in normal
   use. Sharing `panelVisible` between them would mean Escape, the rail and
   the dock's own close button all fighting over one boolean.

   Only panel state lives here — which drone is being looked at, and whether
   the dock is open. The entities themselves are a frozen fixture today and
   a telemetry store tomorrow; neither belongs in a UI store.
=========================================================================== */

export interface SwarmState {
  /** Right dock open. Independent of uiStore.panelVisible. */
  panelOpen: boolean
  /** null shows the grid; an id shows that drone's detail body. */
  selectedId: string | null
}

export const swarmStore = createStore<SwarmState>({
  panelOpen: true,
  selectedId: null,
})

export function useSwarmPanelOpen() {
  return useStoreSelector(swarmStore, (s) => s.panelOpen)
}

export function useSwarmSelectedId() {
  return useStoreSelector(swarmStore, (s) => s.selectedId)
}

export function setSwarmPanelOpen(open: boolean) {
  // Bail before the spread: the store compares by identity, so building a new
  // object first would notify every subscriber even on a no-op write.
  if (swarmStore.get().panelOpen === open) return
  swarmStore.set((s) => ({ ...s, panelOpen: open }))
}

export function toggleSwarmPanel() {
  swarmStore.set((s) => ({ ...s, panelOpen: !s.panelOpen }))
}

/**
 * Open a drone's detail, opening the dock if it was closed.
 *
 * Selecting something the operator cannot then see is a dead end, so the
 * selection carries the panel with it.
 */
export function selectDrone(id: string) {
  const { panelOpen, selectedId } = swarmStore.get()
  if (selectedId === id && panelOpen) return
  swarmStore.set({ panelOpen: true, selectedId: id })
}

/**
 * Step back from detail to the grid. Returns whether it did anything, so the
 * Escape chain in keybindings.ts can use it as a precedence step — the same
 * contract as cancelDraft() and resetCursorMode().
 */
export function clearSwarmSelection(): boolean {
  if (swarmStore.get().selectedId === null) return false
  swarmStore.set((s) => ({ ...s, selectedId: null }))
  return true
}
