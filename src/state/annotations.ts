import { createStore, useStoreSelector } from './createStore'
import { haversineMetres, type LngLat } from '@/lib/geo'
import {
  LABEL_PREFIX,
  MIN_VERTICES,
  type Annotation,
  type AnnotationDraft,
  type AnnotationKind,
} from '@/map/annotations/types'

/* ===========================================================================
   ANNOTATION STORE

   Committed annotations plus the one being drawn.

   Outside React on purpose. The draft's `cursor` updates on every mousemove
   to rubber-band the next segment; routing that through a render would put a
   React commit on the pointer path, which is the same reason telemetry will
   not live in component state. Adapters subscribe with `subscribeSelector` and
   redraw only the slice they own.
=========================================================================== */

const STORAGE_KEY = 'sentinel.annotations.v1'

export interface AnnotationState {
  items: Annotation[]
  draft: AnnotationDraft | null
  /**
   * Bumped by every mutation. Adapters subscribe to this alone.
   *
   * They used to key on a signature built from item count, ids and labels —
   * which contained no geometry, so moving a vertex changed nothing the
   * subscription could see and the map silently kept the old shape. A counter
   * cannot miss a change, and it is cheaper besides: the old key built and
   * joined a string on every write, including 60Hz draft cursor moves.
   */
  revision: number
}

/**
 * Restore committed annotations.
 *
 * Storage access throws outright in some contexts — a private window, cleared
 * site data, a browser set to block site data — so this never assumes it can
 * read, and a failure degrades to an empty map rather than a blank console.
 */
function loadPersisted(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Shape-check rather than trust: this is the one input that survives a
    // reload, so a stale or hand-edited entry must not take the map down.
    return parsed.filter(
      (a): a is Annotation =>
        !!a &&
        typeof a === 'object' &&
        typeof (a as Annotation).id === 'string' &&
        Array.isArray((a as Annotation).positions) &&
        (a as Annotation).positions.length > 0,
    )
  } catch {
    return []
  }
}

export const annotationStore = createStore<AnnotationState>({
  items: loadPersisted(),
  draft: null,
  revision: 0,
})

/**
 * The only way this module writes to the store.
 *
 * Every mutation has to bump `revision` or the adapters will not redraw, and
 * "remember to increment a counter" is exactly the kind of rule a new action
 * forgets. Routing all writes through here makes forgetting impossible.
 */
function mutate(update: (state: AnnotationState) => AnnotationState) {
  annotationStore.set((s) => {
    const next = update(s)
    return next === s ? s : { ...next, revision: s.revision + 1 }
  })
}

// Dev-only handle, mirroring window.__map and window.__cesium. Annotation
// state is otherwise only observable through what the map happens to draw.
if (import.meta.env.DEV) {
  ;(window as unknown as { __annotations?: typeof annotationStore }).__annotations =
    annotationStore
}

/**
 * Persist committed items only.
 *
 * Debounced, and never triggered by draft changes — a mousemove-driven draft
 * would otherwise hit disk sixty times a second for geometry that may never
 * be committed.
 */
let persistTimer: number | undefined
function schedulePersist() {
  if (persistTimer !== undefined) clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(annotationStore.get().items),
      )
    } catch {
      // Out of quota or storage blocked. The annotations still exist in
      // memory for this session; losing them on reload is not worth an error
      // in front of an operator.
    }
  }, 250)
}

/* --- hooks --------------------------------------------------------------- */

export function useAnnotations() {
  return useStoreSelector(annotationStore, (s) => s.items)
}

export function useAnnotationDraft() {
  return useStoreSelector(annotationStore, (s) => s.draft)
}

/* --- draft lifecycle ----------------------------------------------------- */

export function beginDraft(kind: AnnotationKind) {
  mutate((s) => ({ ...s, draft: { kind, positions: [], cursor: null } }))
}

export function addVertex(position: LngLat) {
  mutate((s) =>
    s.draft
      ? {
          ...s,
          draft: { ...s.draft, positions: [...s.draft.positions, position] },
        }
      : s,
  )
}

export function moveCursor(position: LngLat) {
  mutate((s) =>
    s.draft ? { ...s, draft: { ...s.draft, cursor: position } } : s,
  )
}

/** Drop the last placed vertex — an undo for a misplaced click mid-draw. */
export function undoVertex() {
  mutate((s) =>
    s.draft && s.draft.positions.length > 0
      ? { ...s, draft: { ...s.draft, positions: s.draft.positions.slice(0, -1) } }
      : s,
  )
}

/** Drop a final vertex that sits on top of the one before it. */
function dropDuplicateTail(positions: LngLat[], thresholdM: number): LngLat[] {
  if (positions.length < 2) return positions
  const last = positions[positions.length - 1]!
  const previous = positions[positions.length - 2]!
  return haversineMetres(last, previous) <= thresholdM
    ? positions.slice(0, -1)
    : positions
}

/** Next label for a kind, numbered across the session, not per-draw. */
function nextLabel(items: Annotation[], kind: AnnotationKind): string {
  const n = items.filter((a) => a.kind === kind).length + 1
  return `${LABEL_PREFIX[kind]} ${String(n).padStart(2, '0')}`
}

/**
 * Commit the draft if it has enough vertices.
 *
 * Returns whether anything was committed, so callers can distinguish "ended a
 * drawing" from "double-clicked on an empty map" without inspecting the store.
 */
export function commitDraft(): boolean {
  const { draft, items } = annotationStore.get()
  if (!draft) return false

  // A double-click fires a click first, so the gesture that ends a drawing
  // also places a vertex on top of the previous one. Every drawing tool has
  // to drop that; without it a four-corner zone commits with five points and
  // a zero-length final edge.
  //
  // Half a metre, not exact equality: the two clicks land on the same pixel,
  // but the same pixel does not always unproject to bit-identical
  // coordinates. At operational zoom a deliberate vertex is never that close.
  const positions = dropDuplicateTail(draft.positions, 0.5)
  if (positions.length < MIN_VERTICES[draft.kind]) return false

  const annotation: Annotation = {
    id: `${draft.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind: draft.kind,
    positions,
    label: nextLabel(items, draft.kind),
    createdAt: Date.now(),
  }

  mutate((s) => ({ ...s, items: [...s.items, annotation], draft: null }))
  schedulePersist()
  return true
}

/** Abandon the draft. Returns true if there was one — lets Escape fall through. */
export function cancelDraft(): boolean {
  if (!annotationStore.get().draft) return false
  mutate((s) => ({ ...s, draft: null }))
  return true
}

/* --- committed items ----------------------------------------------------- */

export function removeAnnotation(id: string) {
  mutate((s) => ({ ...s, items: s.items.filter((a) => a.id !== id) }))
  schedulePersist()
}

export function renameAnnotation(id: string, label: string) {
  mutate((s) => ({
    ...s,
    items: s.items.map((a) => (a.id === id ? { ...a, label } : a)),
  }))
  schedulePersist()
}

export function clearAnnotations() {
  mutate((s) => ({ ...s, items: [], draft: null }))
  schedulePersist()
}

/* --- editing committed geometry ------------------------------------------ */

/**
 * Move one vertex of a committed annotation.
 *
 * Deliberately does NOT persist: this fires once per animation frame while a
 * vertex is dragged. `commitVertexMove` marks the end of the gesture.
 *
 * An out-of-range index is ignored rather than throwing. The caller derives it
 * from a rendered feature, and a redraw racing a drag could in principle hand
 * over an index that no longer exists — dropping the move is recoverable,
 * taking the console down over a stale integer is not.
 */
export function moveVertex(id: string, index: number, position: LngLat) {
  mutate((s) => {
    const target = s.items.find((a) => a.id === id)
    if (!target || index < 0 || index >= target.positions.length) return s

    return {
      ...s,
      items: s.items.map((a) =>
        a.id === id
          ? {
              ...a,
              positions: a.positions.map((p, i) => (i === index ? position : p)),
            }
          : a,
      ),
    }
  })
}

/**
 * End of a vertex drag.
 *
 * The 250ms persist debounce would already have collapsed the drag's writes
 * into one, so this exists to *name* the moment the gesture finished — which
 * is where an undo entry will be pushed when undo lands.
 */
export function commitVertexMove() {
  schedulePersist()
}
