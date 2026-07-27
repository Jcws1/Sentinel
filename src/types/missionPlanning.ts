import type { Position } from './index'

export type OperationalMissionType =
  | 'patrol_route'
  | 'recon_area'
  | 'relay_position'
  | 'intercept_track'
  | 'escort_group'
  | 'hold'
  | 'return'

export interface OperationalObjective {
  id: string
  name: string
  type: OperationalMissionType
  priority: number
  targetPosition?: Position
  requiredCapabilities: string[]
  minVehicles: number
  maxVehicles: number
  batteryReservePercent?: number
}

export interface MissionAssignment {
  objectiveId: string
  vehicleId: string
  cost: number
  etaSeconds: number | null
  reasons: string[]
}

export interface AssignmentPlan {
  id: string
  createdAt: number
  status: 'PROPOSED' | 'CONFIRMED' | 'AUTO_EXECUTED' | 'REJECTED'
  authority: 'AUTO_EXECUTE' | 'OPERATOR_CONFIRM'
  assignments: MissionAssignment[]
  unfilledObjectiveIds: string[]
  totalCost: number
  summary: string
}
