import type {
  Drone,
  MissionSnapshot,
  TaskingRecommendation,
  ThreatTrack,
} from '../src/types'
import type { DecisionLogDto, PolicyDto } from '../src/api/types'
import { circlePolygon } from '../src/utils/geo'
import type { DemoScenarioRuntime } from '../src/api/demoScenarioTypes'

export interface DecisionEntry {
  id: string
  timestamp: number
  actor: 'operator' | 'system' | 'authority'
  action: string
  detail: string
}

export interface C2State {
  missionId: string
  mission: MissionSnapshot
  drones: Drone[]
  tracks: ThreatTrack[]
  recommendations: TaskingRecommendation[]
  decisionLog: DecisionEntry[]
  policy: PolicyDto
  scenario: DemoScenarioRuntime | null
  tick: number
}

export function createInitialState(): C2State {
  return {
    missionId: 'sentinel-mvp-001',
    mission: {
      state: 'ACTIVE',
      gnss: 'degraded',
      fallbackPositioning: 'ORB-SLAM3 + Mesh',
      c2Link: 'strong',
      swarmAutonomy: false,
      protectedAsset: { lng: 103.8198, lat: 1.3521, alt: 0 },
    },
    drones: [
      {
        id: 'I-07',
        type: 'Interceptor',
        battery: 89,
        position: { lng: 103.812, lat: 1.348, alt: 120 },
        positioningMethod: 'ORB-SLAM3 + Mesh',
        positioningConfidence: 74,
        comms: 'strong',
        payloadStatus: 'Armed',
        assignedTrackId: null,
        meshLinks: ['I-12', 'Relay-02'],
      },
      {
        id: 'I-12',
        type: 'Interceptor',
        battery: 45,
        position: { lng: 103.825, lat: 1.355, alt: 95 },
        positioningMethod: 'ORB-SLAM3 + Mesh',
        positioningConfidence: 68,
        comms: 'weak',
        payloadStatus: 'Armed',
        assignedTrackId: null,
        meshLinks: ['I-07', 'Scout-01'],
      },
      {
        id: 'I-03',
        type: 'Interceptor',
        battery: 92,
        position: { lng: 103.818, lat: 1.36, alt: 110 },
        positioningMethod: 'GNSS',
        positioningConfidence: 96,
        comms: 'strong',
        payloadStatus: 'Armed',
        assignedTrackId: null,
        meshLinks: ['Relay-02'],
      },
      {
        id: 'I-19',
        type: 'Interceptor',
        battery: 78,
        position: { lng: 103.83, lat: 1.345, alt: 105 },
        positioningMethod: 'ORB-SLAM3 + Mesh',
        positioningConfidence: 81,
        comms: 'strong',
        payloadStatus: 'Armed',
        assignedTrackId: null,
        meshLinks: ['I-12', 'Scout-01'],
      },
      {
        id: 'Scout-01',
        type: 'Scout',
        battery: 100,
        position: { lng: 103.82, lat: 1.35, alt: 180 },
        positioningMethod: 'ORB-SLAM3 + Mesh',
        positioningConfidence: 88,
        comms: 'strong',
        payloadStatus: 'Mapping',
        assignedTrackId: null,
        meshLinks: ['I-12', 'I-19', 'Relay-02'],
      },
      {
        id: 'Relay-02',
        type: 'Relay',
        battery: 100,
        position: { lng: 103.815, lat: 1.353, alt: 150 },
        positioningMethod: 'Mesh',
        positioningConfidence: 91,
        comms: 'strong',
        payloadStatus: 'Relaying',
        assignedTrackId: null,
        meshLinks: ['I-07', 'I-03', 'Scout-01'],
      },
    ],
    tracks: [
      {
        id: 'T-04',
        threatClass: 'I',
        position: { lng: 103.835, lat: 1.362, alt: 80 },
        bearing: 215,
        speed: 28,
        altitude: 80,
        etaToAsset: 42,
        fusionConfidence: 91,
        recommendedAction: 'Intercept',
        sensors: ['Radar-A', 'EO/IR-2', 'RF-1'],
      },
      {
        id: 'T-03',
        threatClass: 'II',
        position: { lng: 103.805, lat: 1.34, alt: 60 },
        bearing: 45,
        speed: 18,
        altitude: 60,
        etaToAsset: 78,
        fusionConfidence: 84,
        recommendedAction: 'Hold',
        sensors: ['Radar-A', 'Acoustic-1'],
      },
      {
        id: 'T-07',
        threatClass: 'I',
        position: { lng: 103.842, lat: 1.348, alt: 95 },
        bearing: 280,
        speed: 32,
        altitude: 95,
        etaToAsset: 35,
        fusionConfidence: 88,
        recommendedAction: 'Intercept',
        sensors: ['Radar-B', 'EO/IR-1', 'RF-2'],
      },
    ],
    recommendations: [],
    decisionLog: [],
    policy: {
      zones: [
        {
          id: 'wf-asset',
          name: 'Weapon-Free (2 km)',
          kind: 'weapon-free',
          coordinates: circlePolygon(103.8198, 1.3521, 2000),
        },
        {
          id: 'hf-outer',
          name: 'Hold-Fire buffer (4 km)',
          kind: 'hold-fire',
          coordinates: circlePolygon(103.8198, 1.3521, 4000),
        },
      ],
      rules: [
        {
          id: 'r1',
          expression:
            'If Class I in Weapon-Free and confidence > 85% then Intercept',
          action: 'intercept',
        },
        {
          id: 'r2',
          expression: 'If Class II/III and confidence < 90% then Hold',
          action: 'hold',
        },
      ],
      summary: [
        'Weapon-Free: Class I within 2 km of protected asset',
        'Hold-Fire: Class II/III unless fusion ≥ 90%',
        'Auto-engage: disabled — operator confirm required',
      ],
      readOnly: true,
    },
    scenario: null,
    tick: 0,
  }
}

export function toDecisionLogDto(log: DecisionEntry[]): DecisionLogDto {
  return { entries: log }
}
