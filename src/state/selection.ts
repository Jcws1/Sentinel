import { createStore, useStoreSelector } from './createStore'
import type { Bounds } from '@/lib/format'

/* ===========================================================================
   SELECTION — the seam, not the feature.

   The README is explicit that selection renders optimistically and reconciles
   on backend confirm, and that the room for it should exist before the
   mechanism does. This is that room.

   `confirmed` is what the backend has acknowledged; `pending` is what the
   operator has just done and the console is showing on faith. Keeping them
   apart from the start is the point — retrofitting the distinction later means
   auditing every read site to ask which one it meant.

   Nothing populates these yet. There are no tracks, no interceptors and no
   telemetry, so a box drag over the map has nothing to enclose. The marquee
   is real; the hit test is deliberately a stub that returns none.
=========================================================================== */

export interface SelectionState {
  /** Acknowledged by the backend. */
  confirmed: string[]
  /** Shown optimistically, awaiting confirmation. */
  pending: string[]
  /** Last marquee, kept so the panel can report what was swept. */
  lastBounds: Bounds | null
}

export const selectionStore = createStore<SelectionState>({
  confirmed: [],
  pending: [],
  lastBounds: null,
})

export function useSelection() {
  return useStoreSelector(selectionStore, (s) =>
    s.pending.length > 0 ? s.pending : s.confirmed,
  )
}

/**
 * Hit-test a marquee against on-map entities.
 *
 * Returns the ids swept. Today that is always empty: nothing is on the map to
 * sweep. When telemetry lands this queries the entity store and writes the
 * result to `pending`, leaving `confirmed` for the backend's reply.
 */
export function selectByBounds(bounds: Bounds): string[] {
  const ids: string[] = []
  selectionStore.set((s) => ({ ...s, lastBounds: bounds, pending: ids }))
  return ids
}

export function clearSelection() {
  selectionStore.set((s) => ({ ...s, pending: [], confirmed: [] }))
}
