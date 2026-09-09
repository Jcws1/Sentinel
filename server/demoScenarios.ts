import type { DemoScenarioDefinition, DemoScenarioRuntime } from '../src/api/demoScenarioTypes'
import {
  CHANGI_AIRSPACE_INCURSION_SCENARIO_ID,
  JURONG_INFRASTRUCTURE_ALERT_SCENARIO_ID,
  MANDAI_GNSS_RECOVERY_SCENARIO_ID,
  PULAU_UBIN_PERIMETER_SCENARIO_ID,
  SAFTI_SATURATION_SCENARIO_ID,
  TENGAH_URBAN_BLIND_SPOT_SCENARIO_ID,
  THALES_SWARMBREAKERS_01_SCENARIO_ID,
  THALES_SWARMBREAKERS_03_SCENARIO_ID,
  THALES_SWARMBREAKERS_04_SCENARIO_ID,
} from '../src/api/demoScenarioTypes'
import type { Drone, Position, ThreatTrack } from '../src/types'
import type { C2State } from './state'
import { thalesRadarReplay } from './thalesRadarReplays'

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

const CHANGI_SECTOR = { lng: 103.989, lat: 1.357, alt: 0 }
const SCENARIO_CENTERS: Record<string, Position> = {
  [CHANGI_AIRSPACE_INCURSION_SCENARIO_ID]: CHANGI_SECTOR,
  [JURONG_INFRASTRUCTURE_ALERT_SCENARIO_ID]: { lng: 103.705, lat: 1.27, alt: 0 },
  [PULAU_UBIN_PERIMETER_SCENARIO_ID]: { lng: 103.96, lat: 1.409, alt: 0 },
  [SAFTI_SATURATION_SCENARIO_ID]: { lng: 103.685, lat: 1.345, alt: 0 },
}

export const DEMO_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: CHANGI_AIRSPACE_INCURSION_SCENARIO_ID,
    kind: 'incursion',
    name: 'Changi airspace incursion',
    summary: 'A small mixed drone group enters a constrained aviation sector, requiring rapid track validation and airspace protection decisions.',
    unknownInbound: 2,
    hostileInbound: 1,
    friendlyDrones: 18,
    targets: ['Changi aviation sector', 'Eastern approaches', 'Protected airspace boundary'],
    siteType: 'Aviation sector',
    scale: '1-3 tracks',
    c2Objective: 'Validate the track and coordinate airspace protection.',
    timelineScale: 2,
  },
  {
    id: JURONG_INFRASTRUCTURE_ALERT_SCENARIO_ID,
    kind: 'incursion',
    name: 'Jurong infrastructure alert',
    summary: 'Several tracks appear near a critical-infrastructure sector, testing site prioritisation and cross-agency incident coordination.',
    unknownInbound: 4,
    hostileInbound: 4,
    friendlyDrones: 24,
    targets: ['Jurong Island sector', 'Energy and industrial assets', 'Western maritime approaches'],
    siteType: 'Critical infrastructure',
    scale: '3-8 tracks',
    c2Objective: 'Prioritise sites and allocate a coordinated response.',
    timelineScale: 2,
  },
  {
    id: TENGAH_URBAN_BLIND_SPOT_SCENARIO_ID,
    kind: 'gnss-fade',
    name: 'Tengah urban blind spot',
    summary: 'A patrol enters a dense built environment where satellite geometry and multipath reduce positioning confidence before validated recovery.',
    unknownInbound: 0,
    hostileInbound: 0,
    friendlyDrones: 16,
    targets: ['Dense built environment', 'Covered spaces', 'Urban-canyon approaches'],
    siteType: 'Urban GNSS-constrained',
    scale: 'Friendly fleet',
    c2Objective: 'Maintain a trusted operating picture through degraded positioning.',
    timelineScale: 2,
    durationSeconds: 360,
  },
  {
    id: PULAU_UBIN_PERIMETER_SCENARIO_ID,
    kind: 'incursion',
    name: 'Pulau Ubin perimeter breach',
    summary: 'Low-level tracks approach an island perimeter, testing safe identification and handover between maritime and land responders.',
    unknownInbound: 3,
    hostileInbound: 1,
    friendlyDrones: 18,
    targets: ['Island perimeter', 'Low-level maritime approaches', 'Landing and response sectors'],
    siteType: 'Maritime perimeter',
    scale: '1-4 tracks',
    c2Objective: 'Maintain track custody across sea-to-land response.',
    timelineScale: 2,
  },
  {
    id: SAFTI_SATURATION_SCENARIO_ID,
    kind: 'incursion',
    name: 'SAFTI multi-wave saturation',
    summary: 'Multiple inbound tracks arrive in successive waves, stressing alert triage, sector handover, and resource allocation.',
    unknownInbound: 20,
    hostileInbound: 30,
    friendlyDrones: 60,
    targets: ['SAFTI training sector', 'Western approaches', 'Protected training assets'],
    siteType: 'Training and response sector',
    scale: '20-60 tracks',
    c2Objective: 'Prioritise alerts and sustain command decisions under volume.',
    timelineScale: 2,
  },
  {
    id: MANDAI_GNSS_RECOVERY_SCENARIO_ID,
    kind: 'gnss-fade',
    name: 'Mandai GNSS recovery',
    summary: 'A patrol operates under canopy and simulated positioning loss, then restores navigation only after integrity checks confirm recovery.',
    unknownInbound: 0,
    hostileInbound: 0,
    friendlyDrones: 36,
    targets: ['Canopy-constrained terrain', 'Forest-edge approaches', 'Fallback navigation corridor'],
    siteType: 'Canopy GNSS-constrained',
    scale: 'Friendly fleet',
    c2Objective: 'Use fallback navigation and validate recovery before resuming GNSS.',
    timelineScale: 2,
    durationSeconds: 360,
  },
  {
    id: THALES_SWARMBREAKERS_01_SCENARIO_ID,
    kind: 'radar-replay',
    name: 'Thales 01 · accelerating inbound swarm',
    summary: 'Replays the clustered tracker output for one inbound swarm whose speed increases over a 33-minute synthetic radar recording.',
    unknownInbound: 1,
    hostileInbound: 0,
    friendlyDrones: 8,
    targets: ['Clustered track 0', 'Plot-while-scan radar export', 'Acceleration-ramp trajectory'],
    siteType: 'Simulated ground radar replay',
    scale: '~150 estimated drones',
    c2Objective: 'Maintain one coherent group track while its motion changes.',
    timelineScale: 10,
    durationSeconds: 1996.848,
    dataSource: 'Thales SwarmBreakers scenario 01 · accel_ramp_inbound',
    dataQuality: 'Synthetic; clustered 2-D track with velocity; no truth labels or false alarms.',
    estimatedObjects: 150,
    radarTrackCount: 1,
    mapBounds: [[103.84, 1.31], [104.14, 1.64]],
  },
  {
    id: THALES_SWARMBREAKERS_03_SCENARIO_ID,
    kind: 'radar-replay',
    name: 'Thales 03 · aircraft and swarm crossing',
    summary: 'Replays two independent clustered tracks: one aircraft-sized object and one swarm estimated near 200 drones.',
    unknownInbound: 2,
    hostileInbound: 0,
    friendlyDrones: 10,
    targets: ['Aircraft-sized track 0', 'Swarm track 1', 'Crossing surveillance volume'],
    siteType: 'Simulated mixed-airspace radar replay',
    scale: '1 aircraft + ~200 drones',
    c2Objective: 'Keep dissimilar objects separate without inventing classification intent.',
    timelineScale: 10,
    durationSeconds: 1995.12,
    dataSource: 'Thales SwarmBreakers scenario 03 · avion',
    dataQuality: 'Synthetic; clustered 2-D tracks; track velocity fields missing; no truth labels.',
    estimatedObjects: 201,
    radarTrackCount: 2,
    mapBounds: [[103.70, 1.04], [104.22, 1.59]],
  },
  {
    id: THALES_SWARMBREAKERS_04_SCENARIO_ID,
    kind: 'radar-replay',
    name: 'Thales 04 · perpendicular dive and split',
    summary: 'Replays a roughly 300-drone group that manoeuvres and separates into main, ~20-drone and ~100-drone tracks.',
    unknownInbound: 3,
    hostileInbound: 0,
    friendlyDrones: 12,
    targets: ['Main swarm track', '~20-drone split', '~100-drone split'],
    siteType: 'Simulated swarm split radar replay',
    scale: '~300 drones · 3 tracks',
    c2Objective: 'Preserve track identity and estimated group size through a multi-axis split.',
    timelineScale: 10,
    startOffsetSeconds: 1600,
    durationSeconds: 2416.88,
    dataSource: 'Thales SwarmBreakers scenario 04 · perp_dive_split_180_20_100',
    dataQuality: 'Synthetic; clustered 2-D tracks; velocities missing; one source jump requires review.',
    estimatedObjects: 300,
    radarTrackCount: 3,
    mapBounds: [[103.67, 1.23], [104.23, 1.57]],
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

function friendlyDrone(index: number, fleetSize: number, center: Position): Drone {
  const ring = index % 3
  const angle = (index / Math.max(1, fleetSize)) * Math.PI * 2
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
      lng: center.lng + Math.cos(angle) * radius,
      lat: center.lat + Math.sin(angle) * radius * 0.72,
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

function inboundTrack(
  index: number,
  ingress: 'south' | 'east',
  unknownInbound: number,
  scenarioId: string,
): ThreatTrack {
  const south = ingress === 'south'
  const localIndex = south ? index : index - unknownInbound
  const isInternalChangiTrack = scenarioId === CHANGI_AIRSPACE_INCURSION_SCENARIO_ID && south
  const isChangiScenario = scenarioId === CHANGI_AIRSPACE_INCURSION_SCENARIO_ID
  const target = isChangiScenario
    ? {
        id: 'changi-protected-sector',
        name: 'Changi protected airspace',
        position: { ...CHANGI_SECTOR },
      }
    : TARGETS[index % TARGETS.length]!
  const altitude = south ? 75 + (localIndex % 6) * 9 : 85 + (localIndex % 8) * 8
  const swarmAngle = localIndex * Math.PI * (3 - Math.sqrt(5))
  const swarmRadius = 0.004 + Math.sqrt((localIndex + 0.5) / 20) * 0.024
  const swarmLng = Math.cos(swarmAngle) * swarmRadius
  const swarmLat = Math.sin(swarmAngle) * swarmRadius * 0.65
  const position: Position = isInternalChangiTrack
    ? {
        lng: 103.982 + localIndex * 0.009,
        lat: 1.35 + localIndex * 0.011,
        alt: 60 + localIndex * 18,
      }
    : south
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
  const entryPosition: Position = isInternalChangiTrack
    ? { ...position }
    : south
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
    id: `${isInternalChangiTrack ? 'UNK-C' : south ? 'UNK-S' : 'HST-E'}-${String(localIndex + 1).padStart(2, '0')}`,
    threatClass: south ? 'II' : 'I',
    position,
    bearing: isInternalChangiTrack ? 45 + localIndex * 90 : south ? 0 : 270,
    speed: cruiseSpeed,
    altitude,
    etaToAsset: 300,
    fusionConfidence: south ? 62 + (localIndex % 12) : 88 + (localIndex % 9),
    recommendedAction: south ? 'Hold' : 'Intercept',
    sensors: south ? ['Radar-S', 'RF-2'] : ['Radar-E', 'EO/IR-1', 'RF-1'],
    scenario: {
      affiliation: south ? 'unknown' : 'hostile',
      ingress: isInternalChangiTrack ? 'internal' : ingress,
      targetId: target.id,
      targetName: target.name,
      targetPosition: { ...target.position, alt: altitude },
      entryPosition,
      phase: isInternalChangiTrack ? 'scattered' : 'inbound',
      currentSpeed: Math.max(12, cruiseSpeed * (0.78 + (localIndex % 4) * 0.05)),
    },
  }
}

export function activateDemoScenario(state: C2State, id: string, now = Date.now()): DemoScenarioRuntime {
  const definition = DEMO_SCENARIOS.find((scenario) => scenario.id === id)
  if (!definition) throw new Error(`Demo scenario ${id} not found`)

  state.missionId = `sentinel-demo-${now}`
  state.mission.state = 'ACTIVE'
  const radarReplay = definition.kind === 'radar-replay' ? thalesRadarReplay(definition.id) : undefined
  const scenarioCenter = radarReplay?.sensorPosition ?? SCENARIO_CENTERS[definition.id] ?? { lng: 103.8198, lat: 1.3521, alt: 0 }
  state.mission.protectedAsset = scenarioCenter
  state.mission.gnss = 'active'
  state.mission.fallbackPositioning = null
  state.drones = definition.kind === 'gnss-fade'
    ? Array.from({ length: definition.friendlyDrones }, (_, index) => gnssPatrolDrone(index))
    : Array.from(
        { length: definition.friendlyDrones },
        (_, index) => friendlyDrone(index, definition.friendlyDrones, scenarioCenter),
      )
  state.tracks = definition.kind === 'gnss-fade' || definition.kind === 'radar-replay'
    ? []
    : Array.from({ length: definition.unknownInbound + definition.hostileInbound }, (_, index) =>
      inboundTrack(
        index,
        index < definition.unknownInbound ? 'south' : 'east',
        definition.unknownInbound,
        definition.id,
      ),
      )
  state.recommendations = []
  state.tick = 0
  state.scenario = {
    id: definition.id,
    name: definition.name,
    active: true,
    startedAt: now,
    completedAt: null,
    initialInbound: radarReplay?.tracks.length ?? state.tracks.length,
    remainingInbound: state.tracks.length,
    scattered: state.tracks.filter((track) => track.scenario?.ingress === 'internal').length,
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
      : definition.kind === 'radar-replay'
        ? {
            elapsedSeconds: definition.startOffsetSeconds ?? 0,
            radarTrackCount: 0,
            estimatedObjects: 0,
            sourceTimeSeconds: definition.startOffsetSeconds ?? 0,
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
      : definition.kind === 'radar-replay'
        ? `${definition.name}: replaying clustered synthetic radar tracks from ${definition.dataSource}`
      : `${definition.name}: ${definition.unknownInbound} unknown, ${definition.hostileInbound} hostile, ${definition.friendlyDrones} friendly drones`,
  })
  for (const track of state.tracks.filter((candidate) => candidate.scenario?.ingress === 'internal')) {
    state.decisionLog.unshift({
      id: `log-${now}-${track.id}-internal-detection`,
      timestamp: now,
      actor: 'system',
      action: 'INTERNAL_TRACK_DETECTED',
      detail: `${track.id} was first detected inside Changi protected airspace; no external ingress history is available`,
    })
  }
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
