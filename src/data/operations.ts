export type TrackClass = 'I' | 'II' | 'III'
export type TrackAffiliation = 'hostile' | 'unknown'
export type TaskStatus = 'review' | 'executing' | 'held' | 'rejected'
export type PolicyState = 'within' | 'approval' | 'blocked' | 'stale'
export type EffectorAdapter = 'sentinel-native' | 'wedgetail-sandbox'

export interface OperationalTrack {
  id: string
  affiliation: TrackAffiliation
  threatClass: TrackClass
  speedKmh: number
  altitudeM: number
  bearingDeg: number
  rangeM?: number
  headingDeg?: number
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
  adapter: EffectorAdapter
  launchBoxId?: string
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
  { id: 'THALES-01', affiliation: 'hostile', threatClass: 'I', speedKmh: 360, altitudeM: 362, bearingDeg: 180, rangeM: 1400, headingDeg: 0, etaSeconds: 14, confidence: 96, sensors: ['THALES-GM200-SIM'], ageSeconds: 1, action: 'Intercept' },
  { id: 'THALES-SPLIT-04', affiliation: 'hostile', threatClass: 'I', speedKmh: 120, altitudeM: 120, bearingDeg: 318, rangeM: 47000, headingDeg: 205, etaSeconds: 20, confidence: 94, sensors: ['THALES-SWARMBREAKERS-04'], ageSeconds: 1, action: 'Multi-track intercept' },
]

export const INITIAL_TASKS: MissionTask[] = [
  { id: 'TASK-118', trackId: 'T-04', objective: 'Intercept', assetIds: ['V1', 'V2'], etaSeconds: 68, confidence: 90, status: 'review', policy: 'within', rationale: 'Track data is current and the route passes configured policy checks.', adapter: 'sentinel-native' },
  { id: 'TASK-121', trackId: 'T-07', objective: 'Intercept', assetIds: ['W1', 'W2'], etaSeconds: 74, confidence: 86, status: 'review', policy: 'within', rationale: 'Two-source correlation is current and the route remains outside the protected-location buffer.', adapter: 'sentinel-native' },
  { id: 'TASK-WGT-01', trackId: 'THALES-01', objective: 'Intercept', assetIds: ['WGT-BOX-1'], etaSeconds: 14, confidence: 96, status: 'review', policy: 'within', rationale: 'Converts the Thales GM200 synthetic track to the Wedgetail sandbox API format.', adapter: 'wedgetail-sandbox', launchBoxId: 'box_1' },
  { id: 'TASK-WGT-SPLIT', trackId: 'THALES-SPLIT-04', objective: 'Littoral intercept', assetIds: ['BOX-1', 'BOX-2', 'BOX-3'], etaSeconds: 20, confidence: 94, status: 'review', policy: 'within', rationale: 'Submits four low-level littoral tracks to three Wedgetail launch boxes. Interceptor behavior is visible only in the vendor live simulator.', adapter: 'wedgetail-sandbox', launchBoxId: 'box_1' },
  { id: 'TASK-124', trackId: 'T-03', objective: 'Track', assetIds: ['D1', 'D2'], etaSeconds: 96, confidence: 72, status: 'held', policy: 'approval', rationale: 'One assigned aircraft has lost link; reallocation or supervisor review is required.', adapter: 'sentinel-native' },
]

export const SENSOR_SOURCES = [
  { id: 'SENTINEL-EDGE', name: 'Edge gateway', product: 'Device gateway', state: 'nominal', freshness: 'now', delivery: 'v1.0' },
  { id: 'RDR-01', name: 'Radar', product: 'Range / velocity', state: 'nominal', freshness: '2 s', delivery: '12 Hz' },
  { id: 'RF-03', name: 'RF', product: 'Emitter bearing', state: 'nominal', freshness: '5 s', delivery: '4 Hz' },
  { id: 'ACO-02', name: 'Acoustic', product: 'Rotor bearing', state: 'caution', freshness: '48 s', delivery: '0.8 Hz' },
  { id: 'EOIR-04', name: 'EO / IR', product: 'Visual classification', state: 'nominal', freshness: '7 s', delivery: '2 Hz' },
  { id: 'COP-DEM', name: 'Copernicus DEM', product: 'Terrain elevation', state: 'critical', freshness: '2 h', delivery: 'on demand' },
  { id: 'THALES-GM200-SIM', name: 'Thales radar simulator', product: 'Synthetic target track', state: 'nominal', freshness: '1 s', delivery: 'sandbox' },
] as const

export const SCENARIOS = [
  { id: 'SCN-COAST', name: 'Thales coastal split', context: 'SwarmBreakers 04 · perp_dive_split_180_20_100', forces: '~300 estimated drones · 3 interceptors', duration: 'Split window · 20 s demo', state: 'ready' },
  { id: 'SCN-01', name: 'Sensor replay', context: 'Recorded track input', forces: '4 tracks · 8 adapters', duration: '8 min', state: 'ready' },
  { id: 'SCN-02', name: 'Coverage check', context: 'Fixed-site test data', forces: '6 tracks · 10 adapters', duration: '12 min', state: 'ready' },
  { id: 'SCN-03', name: 'Thales simulator', context: 'Synthetic radar feed', forces: '120 generated objects', duration: '33 min', state: 'running' },
  { id: 'SCN-04', name: 'Positioning fallback', context: 'Reduced-positioning test', forces: '12 simulated aircraft', duration: '6 min', state: 'ready' },
] as const

export const INITIAL_EVENTS: OperationalEvent[] = [
  { id: 'EV-2041', time: '10:24:16', severity: 'info', source: 'C2', entity: 'TASK-118', action: 'Recommendation created for T-04', actor: 'Allocator' },
  { id: 'EV-2040', time: '10:24:12', severity: 'caution', source: 'Fleet', entity: 'D2', action: 'Command link lost; last-known telemetry retained', actor: 'Edge node' },
  { id: 'EV-2039', time: '10:24:08', severity: 'info', source: 'Fusion', entity: 'T-07', action: 'Acoustic evidence associated with radar track', actor: 'Fusion service' },
  { id: 'EV-2038', time: '10:23:59', severity: 'critical', source: 'Policy', entity: 'TASK-124', action: 'Task held pending reviewer decision', actor: 'ROE engine' },
]
