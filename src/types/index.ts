export type DroneType = 'Interceptor' | 'Scout' | 'Relay'
export type HealthState = 'nominal' | 'degraded' | 'offline'
export type PositioningMethod = 'GNSS' | 'ORB-SLAM3' | 'Mesh' | 'VIO' | 'ORB-SLAM3 + Mesh'
export type GnssState = 'active' | 'degraded' | 'denied'
export type CommsState = 'strong' | 'weak' | 'lost'
export type ThreatClass = 'I' | 'II' | 'III'
export type MissionState = 'STANDBY' | 'ACTIVE' | 'HOLD' | 'RECALL'
export type TaskingStatus = 'pending' | 'confirmed' | 'vetoed' | 'auto-executing'
export type IntentAction =
  | 'SWAP'
  | 'DELAY'
  | 'IGNORE'
  | 'ESCALATE'
  | 'RECALL'
  | 'HOLD'
  | 'REASSIGN'
  | 'PRIORITY_UP'
  | 'PRIORITY_DOWN'
  | 'ABORT'

export interface Position {
  lng: number
  lat: number
  alt: number
}

export interface Drone {
  id: string
  type: DroneType
  platformId?: string
  displayName?: string
  groupId?: string | null
  lifecycle?: 'REQUESTED' | 'SPAWNING' | 'INITIALIZING' | 'READY' | 'ACTIVE' | 'FAULT'
  controlBackend?: 'gazebo_velocity' | 'px4_sitl'
  navigationSource?: 'GNSS' | 'SIMULATED_VIO' | 'MESH' | 'DEAD_RECKONING'
  positionUncertaintyM?: number
  battery: number
  position: Position
  positioningMethod: PositioningMethod
  positioningConfidence: number
  comms: CommsState
  payloadStatus: string
  assignedTrackId: string | null
  meshLinks: string[]
  speed?: number
  bearing?: number
  scenarioAnchor?: Position
}

export interface ThreatTrack {
  id: string
  threatClass: ThreatClass
  position: Position
  bearing: number
  speed: number
  altitude: number
  etaToAsset: number
  fusionConfidence: number
  recommendedAction: string
  sensors: string[]
  estimatedGroupSize?: number
  sourceScenario?: string
  etaAvailable?: boolean
  sourceConfidenceAvailable?: boolean
  altitudeAvailable?: boolean
  scenario?: {
    affiliation: 'unknown' | 'hostile'
    ingress: 'south' | 'east' | 'internal'
    targetId: string
    targetName: string
    targetPosition: Position
    entryPosition: Position
    phase: 'inbound' | 'scattered' | 'impact' | 'neutralized'
    currentSpeed: number
    impactAt?: number
  }
}

export interface InterceptRoute {
  waypoints: Position[]
}

export interface TaskingRecommendation {
  id: string
  trackId: string
  droneIds: string[]
  route: InterceptRoute
  etaSeconds: number
  confidence: number
  status: TaskingStatus
  summary: string
  autoExecuteAt: number | null
}

export interface PolicyZone {
  id: string
  name: string
  kind: 'weapon-free' | 'hold-fire' | 'no-go'
  coordinates: [number, number][]
}

export interface MissionSnapshot {
  state: MissionState
  gnss: GnssState
  fallbackPositioning: string | null
  c2Link: CommsState
  swarmAutonomy: boolean
  protectedAsset: Position
}
