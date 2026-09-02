/* ===========================================================================
   GEODESY

   Hand-rolled rather than pulling in turf: about sixty lines, no bundle weight
   on a node that already carries a gigabyte of tiles, and every function here
   can be checked against a known real-world value.

   All coordinates are [longitude, latitude] in degrees — GeoJSON order, and
   the order MapLibre and Cesium both hand back. Swapping the pair is the
   classic bug in this file's subject matter, so the type alias exists to make
   the convention hard to misread at a call site.
=========================================================================== */

/** [longitude, latitude], degrees. GeoJSON order. */
export type LngLat = readonly [number, number]

/** Mean Earth radius (IUGG). Metres. */
const EARTH_RADIUS_M = 6371008.8

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/**
 * Great-circle distance in metres.
 *
 * Haversine on a sphere. Good to a few parts in a thousand against the WGS84
 * ellipsoid, which is far inside the error of a 30 m DEM and of an operator
 * clicking a pixel. If this ever feeds a firing solution rather than a
 * readout, replace it with Vincenty and say so at the call site.
 */
export function haversineMetres(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total path length of a polyline, metres. */
export function pathLengthMetres(positions: readonly LngLat[]): number {
  let total = 0
  for (let i = 1; i < positions.length; i++) {
    total += haversineMetres(positions[i - 1]!, positions[i]!)
  }
  return total
}

/**
 * Initial bearing from a to b, degrees true, normalised to [0, 360).
 *
 * "Initial" matters: on a great circle the bearing changes along the path.
 * Over the tens of kilometres this console deals with the difference is
 * negligible, but the name should not imply a constant heading.
 */
export function initialBearingDeg(a: LngLat, b: LngLat): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b

  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lon2 - lon1)

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/**
 * Area of a closed ring in square metres, by spherical excess.
 *
 * The ring may be open or closed; the first vertex is treated as following
 * the last either way. Returns an unsigned area, so winding order does not
 * matter — an operator drawing a zone clockwise should not get a negative
 * number back.
 */
export function sphericalAreaM2(ring: readonly LngLat[]): number {
  if (ring.length < 3) return 0

  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]!
    const [lon2, lat2] = ring[(i + 1) % ring.length]!
    total +=
      toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)))
  }

  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

/* --- display ------------------------------------------------------------ */

/**
 * Distance with a unit. Switches to km at 1 km.
 *
 * Precision is deliberately coarse: these come from a pixel click, and three
 * decimal places on a number that uncertain would imply accuracy the input
 * never had.
 */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(metres < 10000 ? 2 : 1)} km`
}

/**
 * Bearing as three digits plus °T, e.g. `047°T`.
 *
 * Zero-padded because that is how a bearing is spoken and written in an
 * operational context, and because a fixed width stops the readout jittering
 * as the value crosses 100.
 */
export function formatBearing(degrees: number): string {
  const rounded = Math.round(degrees) % 360
  return `${String(rounded).padStart(3, '0')}°T`
}

/** Area with a unit. Switches to km² at 0.1 km². */
export function formatArea(m2: number): string {
  if (m2 < 100000) return `${Math.round(m2).toLocaleString()} m²`
  return `${(m2 / 1e6).toFixed(2)} km²`
}
