import type { Drone, HealthState } from '../types'

export function droneHealth(drone: Drone): HealthState {
  if (drone.comms === 'lost' || drone.battery <= 0) return 'offline'
  if (
    drone.battery < 30 ||
    drone.comms === 'weak' ||
    drone.positioningConfidence < 70
  ) {
    return 'degraded'
  }
  return 'nominal'
}

export function healthLabel(health: HealthState): string {
  switch (health) {
    case 'nominal':
      return 'NOMINAL'
    case 'degraded':
      return 'DEGRADED'
    case 'offline':
      return 'OFFLINE'
  }
}

export function healthGlyph(health: HealthState): string {
  switch (health) {
    case 'nominal':
      return '●'
    case 'degraded':
      return '▲'
    case 'offline':
      return '■'
  }
}
