import type { SimOrigin, SimSpawnRequest } from './simTypes'

export interface ScenarioGroup {
  id: string
  name: string
  color: string
}

export interface ScenarioMission {
  id: string
  type:
    | 'patrol_route'
    | 'recon_area'
    | 'relay_position'
    | 'intercept_track'
    | 'escort_group'
    | 'hold'
    | 'return'
  priority: number
  target: Record<string, unknown>
  requiredCapabilities: string[]
  minVehicles: number
  maxVehicles: number
}

export interface SavedScenario {
  id: string
  name: string
  origin: SimOrigin
  groups: ScenarioGroup[]
  vehicles: SimSpawnRequest[]
  missions: ScenarioMission[]
  active: boolean
  createdAt: string
  updatedAt: string
}
