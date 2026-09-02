import type { LngLat } from '@/lib/geo'
import {
  annotationStore,
  beginDraft,
  addVertex,
  moveCursor,
  commitDraft,
  cancelDraft,
} from '@/state/annotations'
import type { AnnotationKind } from './types'
import type { CursorModeId } from '../cursorModes'

/* ===========================================================================
   DRAW CONTROLLER

   The interaction rules, in one place, expressed over abstract pointer events
   rather than MapLibre or Cesium events. Both adapters translate their native
   events into these calls and neither gets to decide what a click means — so
   drawing a zone behaves identically whichever renderer is on screen, which
   is the whole point of having two.

              click            move          double-click     Escape
   waypoint   place + commit   —             —                —
   measure    add vertex       rubber-band   commit (>=2)     cancel
   zone       add vertex       rubber-band   close (>=3)      cancel
=========================================================================== */

/** Cursor modes that draw. Select, pan and box-select are not annotations. */
const DRAW_KINDS: Partial<Record<CursorModeId, AnnotationKind>> = {
  measure: 'measure',
  zone: 'zone',
  waypoint: 'waypoint',
}

export function drawKindFor(mode: CursorModeId): AnnotationKind | null {
  return DRAW_KINDS[mode] ?? null
}

/**
 * Handle a click at a map position.
 *
 * Waypoints are a single click with no draft phase — requiring a double-click
 * to commit a one-vertex annotation would be ceremony with nothing behind it.
 */
export function handleClick(mode: CursorModeId, position: LngLat) {
  const kind = drawKindFor(mode)
  if (!kind) return

  if (kind === 'waypoint') {
    beginDraft('waypoint')
    addVertex(position)
    commitDraft()
    return
  }

  if (!annotationStore.get().draft) beginDraft(kind)
  addVertex(position)
}

export function handleMove(mode: CursorModeId, position: LngLat) {
  if (!drawKindFor(mode)) return
  if (!annotationStore.get().draft) return
  moveCursor(position)
}

/**
 * Finish the current drawing.
 *
 * The double-click that ends a path also fires a click first, so the final
 * vertex is already placed by the time this runs — no extra vertex is added
 * here, or every measurement would end with a duplicated point.
 */
export function handleDoubleClick(mode: CursorModeId): boolean {
  if (!drawKindFor(mode)) return false
  // An incomplete draft is discarded rather than left half-drawn: a
  // double-click that cannot close is the operator saying "done", and leaving
  // one dangling vertex on screen would be a state they cannot act on.
  if (!commitDraft()) return cancelDraft()
  return true
}

/** Returns true if a draft was cancelled, so Escape can fall through. */
export function handleEscape(): boolean {
  return cancelDraft()
}
