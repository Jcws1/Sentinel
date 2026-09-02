/* ===========================================================================
   CAMERA ACTIONS

   A tiny registry so chrome can drive the camera without knowing which
   renderer is on screen. MapCanvas owns both the MapLibre map and, when the
   photoreal pack is active, a Cesium viewer; the mode bar should not have to
   care which is live, or import either engine to find out.

   Deliberately not React state: the handler changes when the renderer swaps,
   which is not a render-triggering event, and the mode bar reads it only at
   click time.
=========================================================================== */

type RecenterHandler = () => void

let recenterHandler: RecenterHandler | null = null

/** Called by MapCanvas whenever the active renderer changes. */
export function registerRecenter(handler: RecenterHandler | null) {
  recenterHandler = handler
}

/** Return the camera to its default view. No-op if no renderer is mounted. */
export function recenterCamera() {
  recenterHandler?.()
}
