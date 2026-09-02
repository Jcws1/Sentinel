import type { LngLat } from '@/lib/geo'
import { moveVertex, commitVertexMove } from '@/state/annotations'
import type { CursorModeId } from '../cursorModes'

/* ===========================================================================
   EDIT CONTROLLER

   Dragging a committed annotation's vertex, expressed over abstract pointer
   events so MapLibre and Cesium share one set of rules — the same split as
   drawController.ts, which owns creating geometry while this owns correcting
   it.

   WHY SELECT MODE ONLY

   Each tool keeps exactly one meaning: the draw tools create, Select
   manipulates. In Measure or Zone mode a press on an existing vertex is
   genuinely ambiguous — "place a point here" or "grab that one" — and
   resolving it by whether a draft happens to be open makes the gesture depend
   on state the operator cannot see.

   WHY THE DRAG IS MODULE STATE, NOT STORE STATE

   It is ephemeral interaction state that nothing renders. Only one renderer
   receives pointer events at a time, so there is no second reader to keep in
   sync, and putting it in the store would mean a store write — and a
   notification to every subscriber — per drag start for no redraw.
=========================================================================== */

interface VertexDrag {
  id: string
  index: number
  /**
   * Where the vertex was when the drag began.
   *
   * This is what makes Escape a true revert rather than merely a stop. An
   * accidental drag is undoable without the store needing to know anything
   * about undo.
   */
  origin: LngLat
}

let active: VertexDrag | null = null

/** Only Select manipulates existing geometry — see the note above. */
export function canEditIn(mode: CursorModeId): boolean {
  return mode === 'select'
}

export function isDraggingVertex(): boolean {
  return active !== null
}

export function beginVertexDrag(id: string, index: number, origin: LngLat) {
  active = { id, index, origin }
}

export function dragVertexTo(position: LngLat) {
  if (!active) return
  moveVertex(active.id, active.index, position)
}

/** Finish the drag, keeping the vertex where it was released. */
export function endVertexDrag() {
  if (!active) return
  active = null
  commitVertexMove()
}

/**
 * Abandon the drag and put the vertex back.
 *
 * Returns whether there was one, so Escape can fall through to the next step
 * of its precedence chain when there was not.
 */
export function cancelVertexDrag(): boolean {
  if (!active) return false
  const { id, index, origin } = active
  active = null
  moveVertex(id, index, origin)
  commitVertexMove()
  return true
}
