export type MissionMode = 'defense' | 'recon' | 'attack'
export type TrackClass = 'I' | 'II' | 'III'
export type TrackAffiliation = 'hostile' | 'unknown'
export type TaskStatus = 'review' | 'executing' | 'held' | 'rejected'
export type PolicyState = 'within' | 'approval' | 'blocked' | 'stale'

export interface OperationalTrack {
  id: string
  affiliation: TrackAffiliation
  threatClass: TrackClass
  speedKmh: number
  altitudeM: number
  bearingDeg: number
  etaSeconds: number
  confidence: number
  sensors: string[]
  ageSeconds: number
  action: string
}

export interface MissionTask {
  id: string
  trackId: string
  objective: string
  assetIds: string[]
  etaSeconds: number
  confidence: number
  status: TaskStatus
  policy: PolicyState
  rationale: string
}

export interface OperationalEvent {
  id: string
  time: string
  severity: 'info' | 'caution' | 'critical'
  source: string
  entity: string
  action: string
  actor: string
}

export const TRACKS: OperationalTrack[] = [
  { id: 'T-04', affiliation: 'hostile', threatClass: 'I', speedKmh: 164, altitudeM: 780, bearingDeg: 247, etaSeconds: 46, confidence: 91, sensors: ['RDR-01', 'RF-03', 'EOIR-04'], ageSeconds: 2, action: 'Intercept' },
  { id: 'T-07', affiliation: 'hostile', threatClass: 'I', speedKmh: 151, altitudeM: 690, bearingDeg: 231, etaSeconds: 55, confidence: 87, sensors: ['RDR-01', 'ACO-02'], ageSeconds: 4, action: 'Intercept' },
  { id: 'T-03', affiliation: 'hostile', threatClass: 'II', speedKmh: 118, altitudeM: 1120, bearingDeg: 198, etaSeconds: 89, confidence: 78, sensors: ['RDR-01'], ageSeconds: 8, action: 'Track' },
  { id: 'U-12', affiliation: 'unknown', threatClass: 'III', speedKmh: 72, altitudeM: 430, bearingDeg: 16, etaSeconds: 214, confidence: 54, sensors: ['RF-03'], ageSeconds: 18, action: 'Observe' },
]

export const INITIAL_TASKS: MissionTask[] = [
  { id: 'TASK-118', trackId: 'T-04', objective: 'Intercept', assetIds: ['V1', 'V2'], etaSeconds: 68, confidence: 90, status: 'review', policy: 'within', rationale: 'Class I track inside the declared weapon-free zone; operator confirmation required.' },
  { id: 'TASK-121', trackId: 'T-07', objective: 'Intercept', assetIds: ['W1', 'W2'], etaSeconds: 74, confidence: 86, status: 'review', policy: 'within', rationale: 'Two-source correlation is current and the route remains outside the protected-location buffer.' },
  { id: 'TASK-124', trackId: 'T-03', objective: 'Track', assetIds: ['D1', 'D2'], etaSeconds: 96, confidence: 72, status: 'held', policy: 'approval', rationale: 'One assigned aircraft has lost link; reallocation or supervisor review is required.' },
]

export const SENSOR_SOURCES = [
  { id: 'SENTINEL-EDGE', name: 'Edge gateway', product: 'Device gateway', state: 'nominal', freshness: 'now', delivery: 'v1.0' },
  { id: 'RDR-01', name: 'Radar', product: 'Range / velocity', state: 'nominal', freshness: '2 s', delivery: '12 Hz' },
  { id: 'RF-03', name: 'RF', product: 'Emitter bearing', state: 'nominal', freshness: '5 s', delivery: '4 Hz' },
  { id: 'ACO-02', name: 'Acoustic', product: 'Rotor bearing', state: 'caution', freshness: '48 s', delivery: '0.8 Hz' },
  { id: 'EOIR-04', name: 'EO / IR', product: 'Visual classification', state: 'nominal', freshness: '7 s', delivery: '2 Hz' },
  { id: 'COP-DEM', name: 'Copernicus DEM', product: 'Terrain elevation', state: 'critical', freshness: '2 h', delivery: 'on demand' },
] as const

export const SCENARIOS = [
  { id: 'SCN-01', name: 'Changi Shield', context: 'Aviation / point defense', forces: '4 inbound · 8 friendly', duration: '8 min', state: 'ready' },
  { id: 'SCN-02', name: 'Jurong Infrastructure', context: 'Critical infrastructure', forces: '6 inbound · 10 friendly', duration: '12 min', state: 'ready' },
  { id: 'SCN-03', name: 'Thales Swarm Split', context: 'Synthetic radar replay', forces: '120 estimated objects', duration: '33 min', state: 'running' },
  { id: 'SCN-04', name: 'GNSS Fade', context: 'Navigation-constrained recovery', forces: '12 patrol aircraft', duration: '6 min', state: 'ready' },
] as const

export const INITIAL_EVENTS: OperationalEvent[] = [
  { id: 'EV-2041', time: '10:24:16', severity: 'info', source: 'C2', entity: 'TASK-118', action: 'Recommendation created for T-04', actor: 'Allocator' },
  { id: 'EV-2040', time: '10:24:12', severity: 'caution', source: 'Fleet', entity: 'D2', action: 'Command link lost; last-known telemetry retained', actor: 'Edge node' },
  { id: 'EV-2039', time: '10:24:08', severity: 'info', source: 'Fusion', entity: 'T-07', action: 'Acoustic evidence associated with radar track', actor: 'Fusion service' },
  { id: 'EV-2038', time: '10:23:59', severity: 'critical', source: 'Policy', entity: 'TASK-124', action: 'Task held pending reviewer decision', actor: 'ROE engine' },
]
