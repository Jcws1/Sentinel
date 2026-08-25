import type { EnuVector } from './types'

const SEMI_MAJOR_M = 6_378_137
const ECCENTRICITY_SQUARED = 6.69437999014e-3

export interface GeodeticPosition {
  latitudeDeg: number
  longitudeDeg: number
  heightM: number
}

function geodeticToEcef(position: GeodeticPosition): [number, number, number] {
  const latitude = (position.latitudeDeg * Math.PI) / 180
  const longitude = (position.longitudeDeg * Math.PI) / 180
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const primeVertical =
    SEMI_MAJOR_M / Math.sqrt(1 - ECCENTRICITY_SQUARED * sinLatitude * sinLatitude)
  return [
    (primeVertical + position.heightM) * cosLatitude * Math.cos(longitude),
    (primeVertical + position.heightM) * cosLatitude * Math.sin(longitude),
    (primeVertical * (1 - ECCENTRICITY_SQUARED) + position.heightM) * sinLatitude,
  ]
}

export function geodeticToEnu(
  position: GeodeticPosition,
  origin: GeodeticPosition,
): EnuVector {
  const [x, y, z] = geodeticToEcef(position)
  const [originX, originY, originZ] = geodeticToEcef(origin)
  const dx = x - originX
  const dy = y - originY
  const dz = z - originZ
  const latitude = (origin.latitudeDeg * Math.PI) / 180
  const longitude = (origin.longitudeDeg * Math.PI) / 180
  return {
    eastM: -Math.sin(longitude) * dx + Math.cos(longitude) * dy,
    northM:
      -Math.sin(latitude) * Math.cos(longitude) * dx -
      Math.sin(latitude) * Math.sin(longitude) * dy +
      Math.cos(latitude) * dz,
    upM:
      Math.cos(latitude) * Math.cos(longitude) * dx +
      Math.cos(latitude) * Math.sin(longitude) * dy +
      Math.sin(latitude) * dz,
  }
}
