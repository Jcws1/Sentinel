import type { Position } from '../types'

/** Flat-earth distance in meters between two WGS84 points. */
export function distanceMeters(a: Position, b: Position): number {
  const latRad = (a.lat * Math.PI) / 180
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(latRad)
  const dLat = (b.lat - a.lat) * mPerDegLat
  const dLng = (b.lng - a.lng) * mPerDegLng
  return Math.hypot(dLat, dLng)
}

/** Approximate circle polygon in WGS84 (meters). */
export function circlePolygon(
  lng: number,
  lat: number,
  radiusM: number,
  steps = 64,
): [number, number][] {
  const coords: [number, number][] = []
  const latRad = (lat * Math.PI) / 180
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(latRad)

  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI
    const dx = (Math.cos(angle) * radiusM) / mPerDegLng
    const dy = (Math.sin(angle) * radiusM) / mPerDegLat
    coords.push([lng + dx, lat + dy])
  }
  return coords
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function actionTone(action: string): 'ok' | 'warn' | 'crit' | '' {
  if (action === 'CONFIRM' || action === 'MISSION_ACTIVE') return 'ok'
  if (action === 'VETO' || action === 'ABORT' || action === 'MISSION_RECALL')
    return 'crit'
  if (
    action === 'RECOMMEND' ||
    action === 'HOLD' ||
    action === 'IGNORE' ||
    action.startsWith('MISSION_')
  )
    return 'warn'
  return ''
}
