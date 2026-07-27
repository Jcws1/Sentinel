export type SensorState = 'healthy' | 'degraded' | 'offline'

export interface SensorSource {
  id: string
  name: string
  kind: string
  feed: string
  health: SensorState
  lastPing: string
  cadence: string
  uptime: string
  samples: number[]
  integration: string
  lastPollError?: string | null
  cdseHistory?: Array<{
    id: number
    attemptedAt: string
    completedAt: string
    status: 'healthy' | 'error'
    durationMs: number
    itemCount: number | null
    error: string | null
  }>
}

export const SENSOR_SOURCES: SensorSource[] = [
  { id: 'RDR-01', name: 'Radar', kind: 'KINEMATIC', feed: 'Moving object / range / velocity', health: 'healthy', lastPing: '4s ago', cadence: '12 Hz', uptime: '99.98%', samples: [62, 66, 61, 72, 68, 78, 75, 81, 79, 86, 83, 88], integration: 'Live' },
  { id: 'RF-03', name: 'RF', kind: 'SIGNALS', feed: 'Emitter bearing', health: 'healthy', lastPing: '11s ago', cadence: '4 Hz', uptime: '99.91%', samples: [58, 61, 65, 63, 68, 66, 74, 71, 73, 77, 75, 79], integration: 'Live' },
  { id: 'ACO-02', name: 'Acoustic', kind: 'PASSIVE', feed: 'Probable rotor bearing', health: 'degraded', lastPing: '48s ago', cadence: '0.8 Hz', uptime: '97.42%', samples: [72, 69, 74, 62, 66, 48, 54, 51, 57, 43, 49, 45], integration: 'Live' },
  { id: 'EOIR-04', name: 'EO / IR', kind: 'IMAGERY', feed: 'Visual classification', health: 'healthy', lastPing: '7s ago', cadence: '2 Hz', uptime: '99.86%', samples: [55, 61, 58, 67, 65, 70, 74, 72, 78, 82, 80, 84], integration: 'Live' },
  { id: 'LDR-01', name: 'LiDAR', kind: 'GEOMETRY', feed: 'Local geometry', health: 'healthy', lastPing: '2s ago', cadence: '20 Hz', uptime: '99.96%', samples: [70, 74, 72, 76, 78, 77, 82, 80, 84, 83, 86, 88], integration: 'Live' },
  { id: 'UAV-ODOM', name: 'Drone data', kind: 'TELEMETRY', feed: 'Odometry / pose / vehicle state', health: 'healthy', lastPing: '1s ago', cadence: '30 Hz', uptime: '99.99%', samples: [78, 77, 82, 80, 85, 83, 87, 86, 89, 88, 91, 90], integration: 'Live' },
  { id: 'CDSE-API', name: 'CDSE', kind: 'EARTH OBS.', feed: 'Copernicus DEM coverage and catalogue', health: 'degraded', lastPing: 'Not polled', cadence: 'Hourly', uptime: '--', samples: [68, 68, 61, 65, 54, 58, 57, 48, 53, 51, 46, 49], integration: 'CDSE STAC' },
  { id: 'COP-DEM', name: 'Copernicus DEM', kind: 'TERRAIN', feed: 'Broad elevation and terrain shape', health: 'offline', lastPing: '2h 14m ago', cadence: 'On demand', uptime: '92.16%', samples: [66, 63, 60, 58, 54, 48, 39, 32, 26, 18, 8, 4], integration: 'MapLibre layer' },
]
