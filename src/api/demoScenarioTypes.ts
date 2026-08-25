export const SINGAPORE_MULTI_VECTOR_SCENARIO_ID = 'singapore-multi-vector'
export const SINGAPORE_GNSS_FADE_SCENARIO_ID = 'singapore-gnss-fade'

export type DemoScenarioKind = 'incursion' | 'gnss-fade'
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
  timelineScale: number
  durationSeconds?: number
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
}

export interface DemoScenariosResponse {
  scenarios: DemoScenarioDefinition[]
  active: DemoScenarioRuntime | null
}
