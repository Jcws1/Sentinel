import type { MissionRecording, MissionRecordingEvent } from '../../contracts/missionRecording'
import type {
  Drone,
  MissionSnapshot,
  TaskingRecommendation,
  ThreatTrack,
} from '../types'

const ASSET = { lng: 103.8198, lat: 1.3521, alt: 0 }

function drone(
  id: string,
  lng: number,
  lat: number,
  battery: number,
  assignedTrackId: string | null,
): Drone {
  return {
    id,
    type: 'Interceptor',
    lifecycle: 'ACTIVE',
    battery,
    position: { lng, lat, alt: 100 },
    positioningMethod: 'GNSS',
    positioningConfidence: 94,
    comms: 'strong',
    payloadStatus: assignedTrackId ? 'Armed' : 'Safe',
    assignedTrackId,
    meshLinks: [],
  }
}

function track(
  id: string,
  lng: number,
  lat: number,
  etaToAsset: number,
  threatClass: ThreatTrack['threatClass'],
): ThreatTrack {
  return {
    id,
    threatClass,
    position: { lng, lat, alt: 135 },
    bearing: 142,
    speed: 28,
    altitude: 135,
    etaToAsset,
    fusionConfidence: 91,
    recommendedAction: 'Intercept',
    sensors: ['RADAR-01', 'EO-02'],
  }
}

function event(
  missionId: string,
  startedAt: string,
  sequence: number,
  atMs: number,
  category: MissionRecordingEvent['category'],
  type: string,
  tone: MissionRecordingEvent['tone'],
  summary: string,
  entityIds: string[],
): MissionRecordingEvent {
  return {
    schemaVersion: '1.0',
    missionId,
    sequence,
    eventId: `${missionId}-event-${sequence}`,
    atMs,
    observedAt: new Date(Date.parse(startedAt) + atMs).toISOString(),
    category,
    type,
    tone,
    entityIds,
    summary,
  }
}

function buildRecording({
  id,
  name,
  operation,
  startedAt,
  offset,
  outcome,
}: {
  id: string
  name: string
  operation: string
  startedAt: string
  offset: number
  outcome: MissionRecording['manifest']['outcome']
}): MissionRecording {
  const durationMs = 120_000
  const targetId = `${id}-T1`
  const secondaryId = `${id}-T2`
  const interceptorId = `${id}-I1`
  const supportId = `${id}-I2`
  const baseLng = 103.806 + offset
  const baseLat = 1.365 - offset * 0.25
  const recommendation: TaskingRecommendation = {
    id: `${id}-REC1`,
    trackId: targetId,
    droneIds: [interceptorId, supportId],
    route: {
      waypoints: [
        { lng: 103.816 + offset, lat: 1.348, alt: 100 },
        { lng: baseLng, lat: baseLat, alt: 135 },
      ],
    },
    etaSeconds: 62,
    confidence: 91,
    status: 'confirmed',
    summary: `Intercept ${targetId} with ${interceptorId}`,
    autoExecuteAt: null,
  }
  const mission = (state: MissionSnapshot['state']): MissionSnapshot => ({
    state,
    gnss: 'active',
    fallbackPositioning: null,
    c2Link: 'strong',
    swarmAutonomy: false,
    protectedAsset: ASSET,
  })
  const frameTimes = [0, 20_000, 40_000, 65_000, 90_000, 120_000]
  const keyframes = frameTimes.map((atMs) => {
    const progress = atMs / durationMs
    const targetPresent = atMs < 65_000
    const engaged = atMs >= 24_000 && atMs < 65_000
    return {
      atMs,
      mission: mission(atMs === durationMs ? 'STANDBY' : 'ACTIVE'),
      drones: [
        drone(
          interceptorId,
          103.816 + offset + (baseLng - 103.816 - offset) * Math.min(1, progress * 1.9),
          1.348 + (baseLat - 1.348) * Math.min(1, progress * 1.9),
          Math.round(96 - progress * 31),
          engaged ? targetId : null,
        ),
        drone(
          supportId,
          103.825 + offset + (baseLng + 0.0015 - 103.825 - offset) * Math.min(1, progress * 1.7),
          1.345 + (baseLat - 0.001 - 1.345) * Math.min(1, progress * 1.7),
          Math.round(91 - progress * 25),
          engaged ? targetId : null,
        ),
      ],
      tracks: [
        ...(targetPresent
          ? [track(
              targetId,
              baseLng + progress * 0.004,
              baseLat - progress * 0.006,
              Math.max(20, Math.round(178 - progress * 210)),
              'I',
            )]
          : []),
        track(
          secondaryId,
          103.834 - progress * 0.003,
          1.371 - progress * 0.002,
          Math.round(260 - progress * 70),
          'II',
        ),
      ],
      recommendations: atMs >= 15_000 && atMs < 65_000 ? [recommendation] : [],
    }
  })
  const events = [
    event(id, startedAt, 1, 0, 'event', 'mission.started', 'important', `${name} started`, []),
    event(id, startedAt, 2, 6_000, 'event', 'track.detected', 'important', `${targetId} detected by fused sensors`, [targetId]),
    event(id, startedAt, 3, 15_000, 'decision', 'recommendation.created', 'important', `Recommend ${interceptorId} and ${supportId} for ${targetId}`, [targetId, interceptorId, supportId]),
    event(id, startedAt, 4, 24_000, 'decision', 'recommendation.confirmed', 'important', `Operator confirmed intercept of ${targetId}`, [targetId, interceptorId]),
    event(id, startedAt, 5, 28_000, 'event', 'interceptor.launched', 'normal', `${interceptorId} launched`, [interceptorId]),
    event(id, startedAt, 6, 61_000, 'event', 'target.eliminated', 'critical', `${targetId} eliminated`, [targetId, interceptorId]),
    event(id, startedAt, 7, 65_000, 'event', 'track.removed', 'important', `${targetId} removed from the operational picture`, [targetId]),
    event(id, startedAt, 8, 92_000, 'decision', 'interceptor.recovered', 'normal', `${interceptorId} released from tasking`, [interceptorId]),
    event(id, startedAt, 9, 120_000, 'event', 'mission.completed', 'important', `${name} ${outcome}`, []),
  ]
  return {
    manifest: {
      schemaVersion: '1.0',
      missionId: id,
      name,
      operation,
      startedAt,
      endedAt: new Date(Date.parse(startedAt) + durationMs).toISOString(),
      durationMs,
      outcome,
      eventCount: events.length,
      keyframeIntervalMs: 20_000,
      coordinateFrame: 'WGS84',
      recordingFormat: 'sentinel-mission-ndjson',
    },
    events,
    keyframes,
  }
}

export const MISSION_RECORDINGS: MissionRecording[] = [
  buildRecording({
    id: 'MSN-0726',
    name: 'Harbour Shield 07',
    operation: 'Point defense',
    startedAt: '2026-07-30T02:14:05.000Z',
    offset: 0,
    outcome: 'completed',
  }),
  buildRecording({
    id: 'MSN-0724',
    name: 'Northern Watch 12',
    operation: 'Area surveillance',
    startedAt: '2026-07-28T13:32:11.000Z',
    offset: 0.006,
    outcome: 'completed',
  }),
  buildRecording({
    id: 'MSN-0719',
    name: 'Causeway Guard 04',
    operation: 'Route protection',
    startedAt: '2026-07-24T23:08:42.000Z',
    offset: -0.004,
    outcome: 'partial',
  }),
]

export function recordingById(id: string | null): MissionRecording | null {
  return MISSION_RECORDINGS.find((recording) => recording.manifest.missionId === id) ?? null
}
