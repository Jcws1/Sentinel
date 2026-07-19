/**
 * PMTiles is served via the C2 backend XYZ proxy (Mapbox GL has no addProtocol).
 * See server/pmtilesRoutes.ts — contours at /api/offline/pmtiles/contours/{z}/{x}/{y}.pbf
 */
export function registerPmtilesProtocol(): void {
  /* no-op — Mapbox uses server-side PMTiles → XYZ proxy */
}
