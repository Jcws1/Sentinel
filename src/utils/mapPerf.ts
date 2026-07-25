export type MapPerfTier = 'full' | 'reduced' | 'minimal'

export interface MapPerfConfig {
  tier: MapPerfTier
  geoPushMs: number
  trailLength: number
  meshLinks: boolean
  alertPulse: boolean
}

export function getMapPerfConfig(
  entityCount: number,
  connected: boolean,
): MapPerfConfig {
  if (entityCount > 40 || (!connected && entityCount > 25)) {
    return {
      tier: 'minimal',
      geoPushMs: 66,
      trailLength: 8,
      meshLinks: false,
      alertPulse: false,
    }
  }
  if (entityCount > 22) {
    return {
      tier: 'reduced',
      geoPushMs: 50,
      trailLength: 14,
      meshLinks: true,
      alertPulse: true,
    }
  }
  return {
    tier: 'full',
    geoPushMs: 33,
    trailLength: 28,
    meshLinks: true,
    alertPulse: true,
  }
}
