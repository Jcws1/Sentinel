/* ===========================================================================
   Formatting for values an operator reads off the screen.

   Everything here is display-only. Nothing may round in a way that changes
   meaning, and every quantity carries its unit — an unlabelled number on a
   tactical console is an invitation to misread it.
=========================================================================== */

/** Geographic bounds as MapLibre orders them: west, south, east, north. */
export type Bounds = readonly [number, number, number, number]

/**
 * Longitude with hemisphere. `103.45` → `103.45°E`.
 *
 * Hemisphere letters rather than signed degrees: a leading minus is easy to
 * lose at 10px, and confusing east for west puts you on the wrong side of the
 * planet. The sign is carried by a letter that cannot be missed.
 */
export function formatLon(lon: number, precision = 2): string {
  const hemisphere = lon < 0 ? 'W' : 'E'
  return `${Math.abs(lon).toFixed(precision)}°${hemisphere}`
}

/** Latitude with hemisphere. `1.10` → `1.10°N`. */
export function formatLat(lat: number, precision = 2): string {
  const hemisphere = lat < 0 ? 'S' : 'N'
  return `${Math.abs(lat).toFixed(precision)}°${hemisphere}`
}

/**
 * A bounding box as two corners: south-west → north-east.
 *
 * `103.45°E 1.10°N → 104.25°E 1.65°N`
 *
 * Corner-pair rather than the raw `w s e n` array order, because "two corners
 * of a box" is the thing being described and the array order is an artefact of
 * the file format.
 */
export function formatBounds(bounds: Bounds, precision = 2): string {
  const [west, south, east, north] = bounds
  const sw = `${formatLon(west, precision)} ${formatLat(south, precision)}`
  const ne = `${formatLon(east, precision)} ${formatLat(north, precision)}`
  return `${sw} → ${ne}`
}

/** Rough span of a bounds box in km, for a sense of scale. */
export function formatBoundsSpan(bounds: Bounds): string {
  const [west, south, east, north] = bounds
  const midLat = ((south + north) / 2) * (Math.PI / 180)
  const kmPerDegLat = 110.574
  const kmPerDegLon = 111.32 * Math.cos(midLat)
  const width = Math.abs(east - west) * kmPerDegLon
  const height = Math.abs(north - south) * kmPerDegLat
  return `${Math.round(width)} × ${Math.round(height)} km`
}

/** Inclusive zoom range. `8, 12` → `z8–z12`. */
export function formatZoomRange(min: number, max: number): string {
  return `z${min}–z${max}`
}

/**
 * Ground resolution of a raster pyramid at its deepest zoom, in metres per
 * pixel at the given latitude. This is what actually says whether a DEM is
 * detailed enough, where a zoom number alone does not.
 */
export function metresPerPixel(zoom: number, tileSize: number, lat: number) {
  const earthCircumference = 40075016.686
  const latitudeScale = Math.cos((lat * Math.PI) / 180)
  return (earthCircumference * latitudeScale) / (tileSize * 2 ** zoom)
}

/** `38 m/px` — resolution rounded to something an operator can compare. */
export function formatResolution(
  zoom: number,
  tileSize: number,
  lat: number,
): string {
  const mpp = metresPerPixel(zoom, tileSize, lat)
  return mpp >= 10 ? `${Math.round(mpp)} m/px` : `${mpp.toFixed(1)} m/px`
}
