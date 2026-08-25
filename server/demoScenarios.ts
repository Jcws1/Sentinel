import type { DemoScenarioDefinition, DemoScenarioRuntime } from '../src/api/demoScenarioTypes'
import {
  SINGAPORE_GNSS_FADE_SCENARIO_ID,
  SINGAPORE_MULTI_VECTOR_SCENARIO_ID,
} from '../src/api/demoScenarioTypes'
import type { Drone, Position, ThreatTrack } from '../src/types'
import type { C2State } from './state'

const TARGETS: Array<{ id: string; name: string; position: Position }> = [
  { id: 'orchard', name: 'Orchard Road', position: { lng: 103.8318, lat: 1.3048, alt: 0 } },
  { id: 'cbd', name: 'Central Business District', position: { lng: 103.8517, lat: 1.2834, alt: 0 } },
  { id: 'toa-payoh', name: 'Toa Payoh HDB', position: { lng: 103.8497, lat: 1.3343, alt: 0 } },
  { id: 'tampines', name: 'Tampines HDB', position: { lng: 103.9447, lat: 1.3496, alt: 0 } },
  { id: 'bukit-panjang', name: 'Bukit Panjang HDB', position: { lng: 103.7719, lat: 1.3786, alt: 0 } },
  { id: 'kranji-camp', name: 'Kranji Camp', position: { lng: 103.7466, lat: 1.4214, alt: 0 } },
  { id: 'nee-soon-camp', name: 'Nee Soon Camp', position: { lng: 103.8149, lat: 1.4232, alt: 0 } },
  { id: 'safti', name: 'SAFTI Military Institute', position: { lng: 103.6849, lat: 1.3448, alt: 0 } },
]

export const DEMO_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: SINGAPORE_MULTI_VECTOR_SCENARIO_ID,
    kind: 'incursion',
    name: 'Multi-vector Singapore incursion',
    summary: '20 unknown drones approach from the south while 30 hostile drones approach from the east, then scatter toward civilian and military areas after crossing the border.',
    unknownInbound: 20,
    hostileInbound: 30,
    friendlyDrones: 60,
    targets: TARGETS.map((target) => target.name),
    timelineScale: 2,
  },
  {
    id: SINGAPORE_GNSS_FADE_SCENARIO_ID,
    kind: 'gnss-fade',
    name: 'Singapore GNSS fade',
    summary: 'GNSS reception becomes choppy around dense terrain, degrades under suspected radio-frequency interference, reaches full denial, then returns through integrity-checked recovery.',
    unknownInbound: 0,
    hostileInbound: 0,
    friendlyDrones: 36,
    targets: ['Southern approaches', 'Marina Bay', 'CBD', 'Orchard Road', 'Central Singapore'],
    timelineScale: 2,
    durationSeconds: 360,
  },
]

const GNSS_PATROL_AREAS: Position[] = [
  { lng: 103.8517, lat: 1.2834, alt: 110 },
  { lng: 103.8590, lat: 1.2905, alt: 125 },
  { lng: 103.8318, lat: 1.3048, alt: 105 },
  { lng: 103.8497, lat: 1.3343, alt: 135 },
  { lng: 103.8198, lat: 1.3521, alt: 145 },
  { lng: 103.8750, lat: 1.3150, alt: 120 },
  { lng: 103.8050, lat: 1.2700, alt: 100 },
  { lng: 103.9200, lat: 1.3300, alt: 130 },
  { lng: 103.7800, lat: 1.3200, alt: 115 },
]

function gnssPatrolDrone(index: number): Drone {
  const base = GNSS_PATROL_AREAS[index % GNSS_PATROL_AREAS.length]!
  const lane = Math.floor(index / GNSS_PATROL_AREAS.length)
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  const radius = 0.0025 + lane * 0.0018
  const type = index < 24 ? 'Interceptor' : index < 32 ? 'Scout' : 'Relay'
  const id = `NAV-${String(index + 1).padStart(2, '0')}`
  const position = {
    lng: base.lng + Math.cos(angle) * radius,
    lat: base.lat + Math.sin(angle) * radius * 0.7,
    alt: base.alt + (index % 4) * 8,
  }
  return {
    id,
    type,
    battery: 74 + (index * 7) % 25,
    position,
    scenarioAnchor: { ...position },
    positioningMethod: 'GNSS',
    positioningConfidence: 94 + (index % 5),
    navigationSource: 'GNSS',
    positionUncertaintyM: 1.5 + (index % 4) * 0.4,
    comms: index % 13 === 0 ? 'weak' : 'strong',
    payloadStatus: type === 'Interceptor' ? 'Safe' : type === 'Scout' ? 'Mapping' : 'Relaying',
    assignedTrackId: null,
    meshLinks: [
      `NAV-${String(((index + 1) % 36) + 1).padStart(2, '0')}`,
      `NAV-${String(((index + 35) % 36) + 1).padStart(2, '0')}`,
    ],
    speed: type === 'Relay' ? 8 : 14 + (index % 5),
    bearing: (index * 47) % 360,
  }
}

function friendlyDrone(index: number): Drone {
  const ring = index % 3
  const angle = (index / 60) * Math.PI * 2
  const radius = 0.035 + ring * 0.018
  const type = index < 48 ? 'Interceptor' : index < 56 ? 'Scout' : 'Relay'
  const id = type === 'Interceptor'
    ? `DEF-${String(index + 1).padStart(2, '0')}`
    : type === 'Scout'
      ? `SCOUT-${String(index - 47).padStart(2, '0')}`
      : `RELAY-${String(index - 55).padStart(2, '0')}`
  const peers = [
    `DEF-${String(((index + 1) % 48) + 1).padStart(2, '0')}`,
    `DEF-${String(((index + 47) % 48) + 1).padStart(2, '0')}`,
  ]
  return {
    id,
    type,
    battery: 72 + (index * 7) % 28,
    position: {
      lng: 103.8198 + Math.cos(angle) * radius,
      lat: 1.3521 + Math.sin(angle) * radius * 0.72,
      alt: 90 + (index % 7) * 12,
    },
    positioningMethod: index % 5 === 0 ? 'ORB-SLAM3 + Mesh' : 'GNSS',
    positioningConfidence: 84 + (index % 13),
    comms: index % 11 === 0 ? 'weak' : 'strong',
    payloadStatus: type === 'Interceptor' ? 'Armed' : type === 'Scout' ? 'Mapping' : 'Relaying',
    assignedTrackId: null,
    meshLinks: peers,
    speed: type === 'Interceptor' ? 18 : 0,
    bearing: (angle * 180 / Math.PI + 90) % 360,
  }
}

function inboundTrack(index: number, ingress: 'south' | 'east'): ThreatTrack {
  const south = ingress === 'south'
  const localIndex = south ? index : index - 20
  const target = TARGETS[index % TARGETS.length]!
  const altitude = south ? 75 + (localIndex % 6) * 9 : 85 + (localIndex % 8) * 8
  const swarmAngle = localIndex * Math.PI * (3 - Math.sqrt(5))
  const swarmRadius = 0.004 + Math.sqrt((localIndex + 0.5) / 20) * 0.024
  const swarmLng = Math.cos(swarmAngle) * swarmRadius
  const swarmLat = Math.sin(swarmAngle) * swarmRadius * 0.65
  const position: Position = south
    ? {
        lng: 103.81 + swarmLng,
        lat: 1.155 + swarmLat,
        alt: altitude,
      }
    : {
        lng: 104.095 + Math.floor(localIndex / 10) * 0.012,
        lat: 1.245 + (localIndex % 10) * 0.022,
        alt: altitude,
      }
  const entryPosition: Position = south
    ? {
        lng: 103.81 + swarmLng * 0.72,
        lat: 1.238 + swarmLat * 0.45,
        alt: altitude,
      }
    : { lng: 104.005, lat: 1.255 + (localIndex % 10) * 0.021, alt: altitude }
  const cruiseSpeed = south
    ? 15 + ((localIndex * 5) % 14)
    : 28 + ((localIndex * 5) % 7)
  return {
    id: `${south ? 'UNK-S' : 'HST-E'}-${String(localIndex + 1).padStart(2, '0')}`,
    threatClass: south ? 'II' : 'I',
    position,
    bearing: south ? 0 : 270,
    speed: cruiseSpeed,
    altitude,
    etaToAsset: 300,
    fusionConfidence: south ? 62 + (localIndex % 12) : 88 + (localIndex % 9),
    recommendedAction: south ? 'Hold' : 'Intercept',
    sensors: south ? ['Radar-S', 'RF-2'] : ['Radar-E', 'EO/IR-1', 'RF-1'],
    scenario: {
      affiliation: south ? 'unknown' : 'hostile',
      ingress,
      targetId: target.id,
      targetName: target.name,
      targetPosition: { ...target.position, alt: altitude },
      entryPosition,
      phase: 'inbound',
      currentSpeed: Math.max(12, cruiseSpeed * (0.78 + (localIndex % 4) * 0.05)),
    },
  }
}

export function activateDemoScenario(state: C2State, id: string, now = Date.now()): DemoScenarioRuntime {
  const definition = DEMO_SCENARIOS.find((scenario) => scenario.id === id)
  if (!definition) throw new Error(`Demo scenario ${id} not found`)

  state.missionId = `sentinel-demo-${now}`
  state.mission.state = 'ACTIVE'
  state.mission.protectedAsset = { lng: 103.8198, lat: 1.3521, alt: 0 }
  state.mission.gnss = 'active'
  state.mission.fallbackPositioning = null
  state.drones = definition.kind === 'gnss-fade'
    ? Array.from({ length: definition.friendlyDrones }, (_, index) => gnssPatrolDrone(index))
    : Array.from({ length: definition.friendlyDrones }, (_, index) => friendlyDrone(index))
  state.tracks = definition.kind === 'gnss-fade'
    ? []
    : Array.from({ length: definition.unknownInbound + definition.hostileInbound }, (_, index) =>
        inboundTrack(index, index < definition.unknownInbound ? 'south' : 'east'),
      )
  state.recommendations = []
  state.tick = 0
  state.scenario = {
    id: definition.id,
    name: definition.name,
    active: true,
    startedAt: now,
    completedAt: null,
    initialInbound: state.tracks.length,
    remainingInbound: state.tracks.length,
    scattered: 0,
    impacts: 0,
    friendlyDrones: state.drones.length,
    timelineScale: definition.timelineScale,
    ...(definition.kind === 'gnss-fade'
      ? {
          elapsedSeconds: 0,
          gnssPhase: 'BASELINE' as const,
          affectedDrones: 0,
          deniedDrones: 0,
          recoveringDrones: 0,
          satellitesTracked: 15,
          fixAgeSeconds: 0,
          positionDisagreementM: 1.5,
        }
      : {}),
  }
  state.decisionLog.unshift({
    id: `log-${now}-scenario`,
    timestamp: now,
    actor: 'operator',
    action: 'SCENARIO_ACTIVATED',
    detail: definition.kind === 'gnss-fade'
      ? `${definition.name}: 36 friendly drones, staged GNSS degradation and denial`
      : `${definition.name}: 20 unknown south, 30 hostile east, 60 friendly drones`,
  })
  return { ...state.scenario }
}

export function demoScenarioStatus(state: C2State): DemoScenarioRuntime | null {
  return state.scenario ? { ...state.scenario } : null
}

export function setDemoScenarioTimelineScale(
  state: C2State,
  id: string,
  timelineScale: number,
): { timelineScale: number } {
  const definition = DEMO_SCENARIOS.find((scenario) => scenario.id === id)
  if (!definition) throw new Error(`Demo scenario ${id} not found`)
  if (!Number.isFinite(timelineScale) || timelineScale < 1 || timelineScale > 10) {
    throw new Error('Timeline scale must be between 1 and 10')
  }
  definition.timelineScale = Math.round(timelineScale)
  if (state.scenario?.id === id) state.scenario.timelineScale = definition.timelineScale
  return { timelineScale: definition.timelineScale }
}
