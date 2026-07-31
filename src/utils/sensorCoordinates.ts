export interface SimOrigin {
  latDeg: number
  lngDeg: number
  elevationM: number
}

export function enuToLngLat(
  eastM: number,
  northM: number,
  origin: SimOrigin,
): [number, number] {
  const latRad = (origin.latDeg * Math.PI) / 180
  return [
    origin.lngDeg +
      eastM / (111_320 * Math.max(0.1, Math.cos(latRad))),
    origin.latDeg + northM / 110_540,
  ]
}

export function lngLatToEnu(
  lng: number,
  lat: number,
  origin: SimOrigin,
): { eastM: number; northM: number } {
  const latRad = (origin.latDeg * Math.PI) / 180
  return {
    eastM:
      (lng - origin.lngDeg) *
      111_320 *
      Math.max(0.1, Math.cos(latRad)),
    northM: (lat - origin.latDeg) * 110_540,
  }
}
