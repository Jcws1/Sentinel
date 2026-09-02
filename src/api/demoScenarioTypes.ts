export const CHANGI_AIRSPACE_INCURSION_SCENARIO_ID = 'changi-airspace-incursion'
export const JURONG_INFRASTRUCTURE_ALERT_SCENARIO_ID = 'jurong-infrastructure-alert'
export const TENGAH_URBAN_BLIND_SPOT_SCENARIO_ID = 'tengah-urban-blind-spot'
export const PULAU_UBIN_PERIMETER_SCENARIO_ID = 'pulau-ubin-perimeter-breach'
// Retained for existing saved exercises and automated replay references.
export const SAFTI_SATURATION_SCENARIO_ID = 'singapore-multi-vector'
export const MANDAI_GNSS_RECOVERY_SCENARIO_ID = 'mandai-gnss-recovery'
export const THALES_SWARMBREAKERS_01_SCENARIO_ID = 'thales-swarmbreakers-01'
export const THALES_SWARMBREAKERS_03_SCENARIO_ID = 'thales-swarmbreakers-03'
export const THALES_SWARMBREAKERS_04_SCENARIO_ID = 'thales-swarmbreakers-04'

export const GNSS_FADE_SCENARIO_IDS = [
  TENGAH_URBAN_BLIND_SPOT_SCENARIO_ID,
  MANDAI_GNSS_RECOVERY_SCENARIO_ID,
] as const

export type DemoScenarioKind = 'incursion' | 'gnss-fade' | 'radar-replay'
export type GnssFadePhase = 'BASELINE' | 'CHOPPY' | 'DEGRADED' | 'DENIED' | 'RECOVERING' | 'COMPLETE'

export interface DemoScenarioDefinition {
  id: string
  kind: DemoScenarioKind
  name: string
  summary: string
  unknownInbound: number
  hostileInbound: number
  friendlyDrones: number
  targets: string[]
  siteType: string
  scale: string
  c2Objective: string
  timelineScale: number
  durationSeconds?: number
  dataSource?: string
  dataQuality?: string
  estimatedObjects?: number
  radarTrackCount?: number
  mapBounds?: [[number, number], [number, number]]
}

export interface DemoScenarioRuntime {
  id: string
  name: string
  active: boolean
  startedAt: number
  completedAt: number | null
  initialInbound: number
  remainingInbound: number
  scattered: number
  impacts: number
  friendlyDrones: number
  timelineScale: number
  elapsedSeconds?: number
  gnssPhase?: GnssFadePhase
  affectedDrones?: number
  deniedDrones?: number
  recoveringDrones?: number
  satellitesTracked?: number
  fixAgeSeconds?: number
  positionDisagreementM?: number
  radarTrackCount?: number
  estimatedObjects?: number
  sourceTimeSeconds?: number
}

export interface DemoScenariosResponse {
  scenarios: DemoScenarioDefinition[]
  active: DemoScenarioRuntime | null
}
