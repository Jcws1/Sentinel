export type SimLifecycle =
  | 'REQUESTED'
  | 'SPAWNING'
  | 'INITIALIZING'
  | 'READY'
  | 'ACTIVE'
  | 'FAULT'
  | 'REMOVED'

export interface SimOrigin {
  latDeg: number
  lngDeg: number
  elevationM: number
}

export interface SimHandshake {
  protocol: 'sentinel-sim'
  version: string
  scenarioId: string
  worldName: string
  coordinateFrame: 'ENU'
  origin: SimOrigin
  limits: {
    maxVehicles: number
    px4HotSpawn: boolean
  }
  capabilities: string[]
}

export interface SimVehicle {
  vehicleId: string
  platformId: string
  displayName: string
  role: string
  groupId: string | null
  controlBackend: 'gazebo_velocity' | 'px4_sitl'
  lifecycle: SimLifecycle
  source: 'scenario' | 'runtime'
  pose: {
    frame: 'LOCAL_ENU'
    eastM: number
    northM: number
    upM: number
    rollRad: number
    pitchRad: number
    yawRad: number
  }
  velocity?: {
    eastMS: number
    northMS: number
    upMS: number
  }
  navigationSource?: 'GNSS' | 'SIMULATED_VIO' | 'GAZEBO_TRUTH'
  updatedAt: string
}

export interface SimSnapshot {
  scenarioId: string
  origin: SimOrigin
  vehicles: SimVehicle[]
  faults: SimFault[]
}

export interface SimPlatform {
  platformId: string
  displayName: string
  role: string
  evidenceStatus: string
  geometry: {
    dimensions_m: [number, number, number]
    mass_kg: number
  }
  hotSpawnBackend: 'gazebo_velocity'
}

export interface SimSpawnRequest {
  vehicleId: string
  platformId: string
  displayName?: string
  role?: string
  groupId?: string | null
  pose: [number, number, number, number, number, number]
  controlBackend?: 'gazebo_velocity'
}

export interface SimBatchSpawnRequest {
  idPrefix: string
  count: number
  platformId: string
  displayName?: string
  role?: string
  groupId?: string | null
  pose: [number, number, number, number, number, number]
  spacingM?: number
}

export interface SimBatchSpawnResponse {
  requestedCount: number
  vehicles: SimVehicle[]
}

export interface SimCommand {
  commandId: string
  vehicleId: string
  kind: 'velocity' | 'stop' | 'goto'
  expiresAt?: string
  velocity?: {
    forwardMS?: number
    rightMS?: number
    upMS?: number
    yawRateRadS?: number
  }
  targetPose?: {
    eastM: number
    northM: number
    upM: number
  }
  maxSpeedMS?: number
}

export interface SimCommandAck {
  commandId: string
  vehicleId: string
  status:
    | 'ACCEPTED'
    | 'EXECUTING'
    | 'SUCCEEDED'
    | 'REJECTED'
    | 'FAILED'
    | 'EXPIRED'
  timestamp: string
  error: string | null
  errorCode: string | null
}

export interface SimFault {
  faultId: string
  vehicleId: string | null
  kind: 'gnss_denied' | 'vio_lost' | 'link_degraded' | 'vehicle_failure'
  active: boolean
  parameters: Record<string, unknown>
  updatedAt: string
}

export interface SimFleetBehaviorRequest {
  mode:
    | 'hold'
    | 'forward'
    | 'expand'
    | 'orbit'
    | 'line'
    | 'column'
    | 'wedge'
    | 'flocking'
  groupId?: string
  vehicleIds?: string[]
  spacingM?: number
  missionVelocity?: { eastMS: number; northMS: number }
}

export interface SimFleetWaypointRequest {
  vehicleIds: string[]
  formation: 'line' | 'column' | 'wedge' | 'flocking'
  targetPose: { eastM: number; northM: number }
  spacingM: number
  maxSpeedMS: number
  minimumTerrainClearanceM: number
}

export interface SimFleetWaypointResponse {
  taskId: string
  status: 'EN_ROUTE'
  vehicleIds: string[]
  formation: SimFleetWaypointRequest['formation']
  targetPose: SimFleetWaypointRequest['targetPose']
  routeWaypoints: Array<{ eastM: number; northM: number }>
  slotAssignments: Record<string, number>
  avoidance: {
    terrainMap: boolean
    buildingMap: boolean
    neighbourSeparation: boolean
  }
  updatedAt: string
}

export interface SimEvent<T = unknown> {
  protocol: 'sentinel-sim'
  protocolVersion: string
  messageId: string
  sequence: number
  timestamp: string
  scenarioId: string
  type:
    | 'state.snapshot'
    | 'vehicle.lifecycle'
    | 'telemetry.frame'
    | 'command.ack'
    | 'fault.updated'
    | 'camera.updated'
    | 'fleet.behavior'
    | 'fleet.waypoint'
  data: T
}
