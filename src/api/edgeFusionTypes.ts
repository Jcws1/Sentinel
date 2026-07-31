export interface FusedSensorTrack {
  trackId: string
  lifecycle: 'TENTATIVE' | 'CONFIRMED' | 'COASTING'
  positionEnuM: {
    east: number
    north: number
    up: number
  }
  velocityEnuMS: {
    east: number
    north: number
    up: number
  }
  covarianceM2: number[]
  confidence: number
  classifications: Array<{ label: string; confidence: number }>
  sensorIds: string[]
  modalities: Array<'radar' | 'rf' | 'eo' | 'ir' | 'acoustic'>
  observationIds: string[]
  firstObservedAt: string
  lastObservedAt: string
  updateCount: number
}

export interface SensorFusionSnapshot {
  tracks: FusedSensorTrack[]
  unassociatedBearingCount: number
  lastIngressSequence: number
  updatedAt: string | null
  sourceStatus: 'CONNECTED' | 'DEGRADED' | 'OFFLINE'
  error: string | null
}
