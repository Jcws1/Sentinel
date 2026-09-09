import { buildRecommendation } from '../src/utils/tasking'
import {
  GNSS_FADE_SCENARIO_IDS,
  type GnssFadePhase,
} from '../src/api/demoScenarioTypes'
import type { Position, TaskingRecommendation, ThreatTrack } from '../src/types'
import type { C2State } from './state'
import {
  THALES_RADAR_REPLAY_IDS,
  thalesRadarReplay,
  type RadarReplayKeyframe,
  type RadarReplayTrack,
} from './thalesRadarReplays'

const SIMULATION_TICK_SECONDS = 0.4
const IMPACT_VISIBLE_MS = 2_400
const INTERCEPTOR_SPEED_MPS = 70
const INTERCEPT_CONTACT_METERS = 8
const INTERCEPTOR_ACCELERATION_MPS2 = 18
const INTERCEPTOR_TURN_RATE_DPS = 120
const UNKNOWN_ACCELERATION_MPS2 = 4
const HOSTILE_ACCELERATION_MPS2 = 7
const UNKNOWN_TURN_RATE_DPS = 45
const HOSTILE_TURN_RATE_DPS = 75

const THREAT_VELOCITY: Record<string, { dLng: number; dLat: number }> = {
  'T-04': { dLng: -0.00004, dLat: -0.00003 },
  'T-03': { dLng: 0.00003, dLat: 0.00002 },
  'T-07': { dLng: -0.00005, dLat: 0.00001 },
}

function orbitOffset(t: number, radius: number, phase: number): Position {
  return {
    lng: Math.cos(t + phase) * radius,
    lat: Math.sin(t + phase) * radius * 0.7,
    alt: 0,
  }
}

function distanceMeters(from: Position, to: Position): number {
  const dLat = (to.lat - from.lat) * 111_320
  const dLng =
    (to.lng - from.lng) *
    111_320 *
    Math.cos((((from.lat + to.lat) / 2) * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360
}

function signedHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

function bearingTo(from: Position, to: Position): number {
  const north = (to.lat - from.lat) * 111_320
  const east = (to.lng - from.lng) * 111_320 * Math.cos(from.lat * Math.PI / 180)
  return normalizeDegrees(Math.atan2(east, north) * 180 / Math.PI)
}

function approach(current: number, target: number, maximumChange: number): number {
  if (current < target) return Math.min(target, current + maximumChange)
  return Math.max(target, current - maximumChange)
}

function projectPosition(position: Position, bearing: number, distance: number, targetAlt: number): Position {
  const radians = bearing * Math.PI / 180
  const north = Math.cos(radians) * distance
  const east = Math.sin(radians) * distance
  return {
    lng: position.lng + east / (111_320 * Math.cos(position.lat * Math.PI / 180)),
    lat: position.lat + north / 111_320,
    alt: approach(position.alt, targetAlt, Math.max(1, distance * 0.35)),
  }
}

function relativeMeters(position: Position, origin: Position): [number, number, number] {
  return [
    (position.lng - origin.lng) * 111_320 * Math.cos(origin.lat * Math.PI / 180),
    (position.lat - origin.lat) * 111_320,
    position.alt - origin.alt,
  ]
}

function closestPointTime(
  startA: Position,
  endA: Position,
  startB: Position,
  endB: Position,
): { time: number; distance: number } {
  const a0 = relativeMeters(startA, startB)
  const a1 = relativeMeters(endA, startB)
  const b1 = relativeMeters(endB, startB)
  const relativeStart = a0
  const relativeEnd: [number, number, number] = [a1[0] - b1[0], a1[1] - b1[1], a1[2] - b1[2]]
  const delta: [number, number, number] = [
    relativeEnd[0] - relativeStart[0],
    relativeEnd[1] - relativeStart[1],
    relativeEnd[2] - relativeStart[2],
  ]
  const denominator = delta[0] ** 2 + delta[1] ** 2 + delta[2] ** 2
  const time = denominator === 0
    ? 0
    : Math.max(0, Math.min(1, -(
        relativeStart[0] * delta[0] +
        relativeStart[1] * delta[1] +
        relativeStart[2] * delta[2]
      ) / denominator))
  return {
    time,
    distance: Math.hypot(
      relativeStart[0] + delta[0] * time,
      relativeStart[1] + delta[1] * time,
      relativeStart[2] + delta[2] * time,
    ),
  }
}

function interpolatePosition(from: Position, to: Position, time: number): Position {
  return {
    lng: from.lng + (to.lng - from.lng) * time,
    lat: from.lat + (to.lat - from.lat) * time,
    alt: from.alt + (to.alt - from.alt) * time,
  }
}

function radarReplayFrame(
  track: RadarReplayTrack,
  elapsedSeconds: number,
): { position: Position; estimatedObjects: number; bearing: number; speed: number } | null {
  const first = track.keyframes[0]
  const last = track.keyframes[track.keyframes.length - 1]
  if (!first || !last || elapsedSeconds < first.t || elapsedSeconds > last.t) return null

  let from: RadarReplayKeyframe = first
  let to: RadarReplayKeyframe = last
  for (let index = 1; index < track.keyframes.length; index += 1) {
    const candidate = track.keyframes[index]!
    if (candidate.t >= elapsedSeconds) {
      to = candidate
      from = track.keyframes[index - 1]!
      break
    }
  }
  const duration = Math.max(0.001, to.t - from.t)
  const progress = Math.max(0, Math.min(1, (elapsedSeconds - from.t) / duration))
  const fromPosition = { lng: from.lon, lat: from.lat, alt: 0 }
  const toPosition = { lng: to.lon, lat: to.lat, alt: 0 }
  return {
    position: interpolatePosition(fromPosition, toPosition, progress),
    estimatedObjects: from.estimatedObjects + (to.estimatedObjects - from.estimatedObjects) * progress,
    bearing: bearingTo(fromPosition, toPosition),
    speed: distanceMeters(fromPosition, toPosition) / duration,
  }
}

function radarReplayThreat(
  replayId: string,
  track: RadarReplayTrack,
  frame: NonNullable<ReturnType<typeof radarReplayFrame>>,
  remainingSeconds: number,
): ThreatTrack {
  const last = track.keyframes[track.keyframes.length - 1]!
  return {
    id: `THALES-${replayId.slice(-2)}-${track.id}`,
    threatClass: track.role === 'aircraft' ? 'I' : 'III',
    position: frame.position,
    bearing: Math.round(frame.bearing),
    speed: Math.round(frame.speed * 10) / 10,
    altitude: 0,
    etaToAsset: Math.max(0, Math.round(remainingSeconds)),
    fusionConfidence: 0,
    recommendedAction: 'Hold',
    sensors: ['Thales simulated ground radar'],
    estimatedGroupSize: Math.max(1, Math.round(frame.estimatedObjects)),
    sourceScenario: replayId,
    etaAvailable: false,
    sourceConfidenceAvailable: false,
    altitudeAvailable: false,
    scenario: {
      affiliation: 'unknown',
      ingress: 'internal',
      targetId: `${replayId}-${track.id}-end`,
      targetName: 'End of supplied radar track',
      targetPosition: { lng: last.lon, lat: last.lat, alt: 0 },
      entryPosition: { ...frame.position },
      phase: 'inbound',
      currentSpeed: frame.speed,
    },
  }
}

export function advanceThalesRadarReplay(state: C2State, now: number, stepSeconds: number): void {
  const runtime = state.scenario
  if (!runtime?.active || !THALES_RADAR_REPLAY_IDS.includes(runtime.id)) return
  const replay = thalesRadarReplay(runtime.id)
  if (!replay) return

  const elapsed = Math.min(replay.durationSeconds, (runtime.elapsedSeconds ?? 0) + stepSeconds)
  const previousTracks = new Map(state.tracks.map((track) => [track.id, track]))
  const previousIds = new Set(previousTracks.keys())
  const replayAuthorizationActive = state.tracks.some(
    (track) => track.sourceScenario === replay.id && track.operatorAuthorizedForIntercept,
  )
  const nextTracks: ThreatTrack[] = []
  for (const sourceTrack of replay.tracks) {
    const frame = radarReplayFrame(sourceTrack, elapsed)
    if (!frame) continue
    const lastTime = sourceTrack.keyframes[sourceTrack.keyframes.length - 1]!.t
    const track = radarReplayThreat(replay.id, sourceTrack, frame, lastTime - elapsed)
    const previousTrack = previousTracks.get(track.id)
    if (previousTrack?.scenario?.phase === 'neutralized') {
      track.position = { ...previousTrack.position }
      track.speed = 0
      track.recommendedAction = 'Neutralized'
      track.operatorAuthorizedForIntercept = true
      if (track.scenario) {
        track.scenario.phase = 'neutralized'
        track.scenario.currentSpeed = 0
      }
    } else if (previousTrack?.operatorAuthorizedForIntercept || replayAuthorizationActive) {
      track.operatorAuthorizedForIntercept = true
      track.recommendedAction = 'Intercept'
    }
    nextTracks.push(track)
    if (!previousIds.has(track.id)) {
      state.decisionLog.unshift({
        id: `log-${now}-${track.id}-established`,
        timestamp: now,
        actor: 'system',
        action: 'RADAR_TRACK_ESTABLISHED',
        detail: `${track.id} established from clustered replay data; estimated group size ${track.estimatedGroupSize}`,
      })
      if (replayAuthorizationActive) {
        state.decisionLog.unshift({
          id: `log-${now}-${track.id}-authority-inherited`,
          timestamp: now,
          actor: 'system',
          action: 'INTERCEPT_AUTHORITY_INHERITED',
          detail: `${track.id} inherited operator tasking authority after the authorised swarm split`,
        })
      }
    }
  }

  const nextIds = new Set(nextTracks.map((track) => track.id))
  for (const previousId of previousIds) {
    if (!nextIds.has(previousId)) {
      state.decisionLog.unshift({
        id: `log-${now}-${previousId}-ended`,
        timestamp: now,
        actor: 'system',
        action: 'RADAR_TRACK_ENDED',
        detail: `${previousId} reached the end of its supplied measurement-updated track`,
      })
    }
  }

  state.tracks = nextTracks
  state.recommendations = state.recommendations.filter((recommendation) =>
    nextIds.has(recommendation.trackId),
  )
  runtime.elapsedSeconds = elapsed
  runtime.sourceTimeSeconds = elapsed
  runtime.radarTrackCount = nextTracks.length
  runtime.estimatedObjects = nextTracks.reduce(
    (total, track) => total + (track.estimatedGroupSize ?? 1),
    0,
  )
  runtime.remainingInbound = nextTracks.length
  if (elapsed >= replay.durationSeconds) {
    runtime.active = false
    runtime.completedAt = now
  }
}

function advanceKinematic(
  position: Position,
  bearing: number,
  currentSpeed: number,
  targetSpeed: number,
  destination: Position,
  acceleration: number,
  turnRate: number,
  stepSeconds: number,
): { position: Position; bearing: number; speed: number; arrived: boolean } {
  const desiredBearing = bearingTo(position, destination)
  const headingChange = Math.max(
    -turnRate * stepSeconds,
    Math.min(turnRate * stepSeconds, signedHeadingDelta(bearing, desiredBearing)),
  )
  const nextBearing = normalizeDegrees(bearing + headingChange)
  const nextSpeed = approach(currentSpeed, targetSpeed, acceleration * stepSeconds)
  const travelDistance = ((currentSpeed + nextSpeed) / 2) * stepSeconds
  const nextPosition = projectPosition(position, nextBearing, travelDistance, destination.alt)
  const arrival = closestPointTime(position, nextPosition, destination, destination)
  if (arrival.distance <= 8) {
    return { position: { ...destination }, bearing: nextBearing, speed: nextSpeed, arrived: true }
  }
  return { position: nextPosition, bearing: nextBearing, speed: nextSpeed, arrived: false }
}

function advanceScenarioTracks(state: C2State, now: number, stepSeconds: number): void {
  const runtime = state.scenario
  if (!runtime?.active) return

  for (const track of state.tracks) {
    const scenario = track.scenario
    if (!scenario || scenario.phase === 'impact' || scenario.phase === 'neutralized') continue
    const destination = scenario.phase === 'inbound'
      ? scenario.entryPosition
      : scenario.targetPosition
    const acceleration = scenario.affiliation === 'hostile'
      ? HOSTILE_ACCELERATION_MPS2
      : UNKNOWN_ACCELERATION_MPS2
    const turnRate = scenario.affiliation === 'hostile'
      ? HOSTILE_TURN_RATE_DPS
      : UNKNOWN_TURN_RATE_DPS
    const movement = advanceKinematic(
      track.position,
      track.bearing,
      scenario.currentSpeed,
      track.speed,
      destination,
      acceleration,
      turnRate,
      stepSeconds,
    )
    track.position = movement.position
    track.altitude = track.position.alt
    track.bearing = movement.bearing
    scenario.currentSpeed = movement.speed
    track.etaToAsset = Math.max(
      0,
      Math.round(distanceMeters(track.position, destination) / Math.max(movement.speed, 1)),
    )

    if (!movement.arrived) continue
    if (scenario.phase === 'inbound') {
      scenario.phase = 'scattered'
      scenario.currentSpeed *= 0.78
      runtime.scattered += 1
      state.decisionLog.unshift({
        id: `log-${now}-${track.id}-scatter`,
        timestamp: now,
        actor: 'system',
        action: 'BORDER_CROSSED',
        detail: `${track.id} crossed the Singapore border and scattered toward ${scenario.targetName}`,
      })
    } else {
      scenario.phase = 'impact'
      scenario.impactAt = now
      runtime.impacts += 1
      state.decisionLog.unshift({
        id: `log-${now}-${track.id}-impact`,
        timestamp: now,
        actor: 'system',
        action: 'TARGET_REACHED',
        detail: `${track.id} reached ${scenario.targetName}`,
      })
    }
  }

  const expiredTrackIds = new Set(
    state.tracks
      .filter((track) => {
        const impactAt = track.scenario?.impactAt
        return impactAt !== undefined && now - impactAt >= IMPACT_VISIBLE_MS
      })
      .map((track) => track.id),
  )
  if (expiredTrackIds.size > 0) {
    state.tracks = state.tracks.filter((track) => !expiredTrackIds.has(track.id))
    state.recommendations = state.recommendations.filter(
      (recommendation) => !expiredTrackIds.has(recommendation.trackId),
    )
    for (const drone of state.drones) {
      if (drone.assignedTrackId && expiredTrackIds.has(drone.assignedTrackId)) {
        drone.assignedTrackId = null
      }
    }
  }

  runtime.remainingInbound = state.tracks.filter(
    (track) => track.scenario?.phase === 'inbound' || track.scenario?.phase === 'scattered',
  ).length
  if (runtime.remainingInbound === 0) {
    runtime.active = false
    runtime.completedAt = now
  }
}

function gnssPhaseAt(elapsedSeconds: number): GnssFadePhase {
  if (elapsedSeconds < 45) return 'BASELINE'
  if (elapsedSeconds < 105) return 'CHOPPY'
  if (elapsedSeconds < 180) return 'DEGRADED'
  if (elapsedSeconds < 285) return 'DENIED'
  if (elapsedSeconds < 360) return 'RECOVERING'
  return 'COMPLETE'
}

const GNSS_PHASE_DETAILS: Record<GnssFadePhase, string> = {
  BASELINE: 'GNSS baseline established across the patrol fleet',
  CHOPPY: 'Intermittent fixes and multipath disagreement detected near dense terrain',
  DEGRADED: 'Suspected GNSS radio-frequency interference is spreading inland',
  DENIED: 'No trustworthy GNSS fixes remain; fleet switched to VIO, mesh and inertial fallback',
  RECOVERING: 'GNSS signals returned; integrity validation is in progress before reuse',
  COMPLETE: 'GNSS fixes passed cross-sensor validation and normal navigation was restored',
}

export function advanceGnssFadeScenario(state: C2State, now: number, stepSeconds: number): void {
  const runtime = state.scenario
  if (!runtime?.active || !GNSS_FADE_SCENARIO_IDS.includes(runtime.id as typeof GNSS_FADE_SCENARIO_IDS[number])) return

  runtime.elapsedSeconds = Math.min(360, (runtime.elapsedSeconds ?? 0) + stepSeconds)
  const previousPhase = runtime.gnssPhase ?? 'BASELINE'
  const phase = gnssPhaseAt(runtime.elapsedSeconds)
  runtime.gnssPhase = phase

  if (phase !== previousPhase) {
    state.decisionLog.unshift({
      id: `log-${now}-gnss-${phase.toLowerCase()}`,
      timestamp: now,
      actor: 'system',
      action: `GNSS_${phase}`,
      detail: GNSS_PHASE_DETAILS[phase],
    })
  }

  let affected = 0
  let denied = 0
  let recovering = 0
  for (const [index, drone] of state.drones.entries()) {
    const exposureRank = ((index * 11) % state.drones.length) / Math.max(1, state.drones.length - 1)
    const pulse = 0.5 + 0.5 * Math.sin(runtime.elapsedSeconds * 0.62 + index * 1.7)

    if (phase === 'BASELINE' || phase === 'COMPLETE') {
      drone.navigationSource = 'GNSS'
      drone.positioningMethod = 'GNSS'
      drone.positioningConfidence = 94 + (index % 5)
      drone.positionUncertaintyM = 1.5 + (index % 4) * 0.4
      continue
    }

    if (phase === 'CHOPPY') {
      const progress = (runtime.elapsedSeconds - 45) / 60
      const isAffected = exposureRank < 0.25 + progress * 0.45 && pulse > 0.18
      if (!isAffected) {
        drone.navigationSource = 'GNSS'
        drone.positioningMethod = 'GNSS'
        drone.positioningConfidence = 91 + (index % 6)
        drone.positionUncertaintyM = 2 + (index % 3)
        continue
      }
      affected += 1
      drone.navigationSource = 'GNSS'
      drone.positioningMethod = 'GNSS'
      drone.positioningConfidence = Math.round(86 - pulse * 18 - progress * 7)
      drone.positionUncertaintyM = Math.round((4 + pulse * 12 + progress * 6) * 10) / 10
      continue
    }

    if (phase === 'DEGRADED') {
      const progress = (runtime.elapsedSeconds - 105) / 75
      const isAffected = exposureRank < 0.55 + progress * 0.45
      if (!isAffected) {
        drone.navigationSource = 'GNSS'
        drone.positioningMethod = 'GNSS'
        drone.positioningConfidence = 86 + (index % 7)
        drone.positionUncertaintyM = 4 + (index % 4)
        continue
      }
      affected += 1
      const fallbackActive = pulse + progress > 0.85
      drone.navigationSource = fallbackActive ? 'SIMULATED_VIO' : 'GNSS'
      drone.positioningMethod = fallbackActive ? 'ORB-SLAM3 + Mesh' : 'GNSS'
      drone.positioningConfidence = Math.round(76 - progress * 18 - pulse * 7)
      drone.positionUncertaintyM = Math.round((14 + progress * 29 + pulse * 7) * 10) / 10
      continue
    }

    if (phase === 'DENIED') {
      affected += 1
      denied += 1
      const deniedAge = runtime.elapsedSeconds - 180
      const overWaterOrSparse = drone.scenarioAnchor?.lat !== undefined && drone.scenarioAnchor.lat < 1.292
      const driftRate = overWaterOrSparse ? 0.7 : drone.type === 'Relay' ? 0.2 : 0.34
      drone.navigationSource = drone.type === 'Relay'
        ? 'MESH'
        : index % 7 === 0 ? 'DEAD_RECKONING' : 'SIMULATED_VIO'
      drone.positioningMethod = drone.type === 'Relay' ? 'Mesh' : 'ORB-SLAM3 + Mesh'
      drone.positioningConfidence = Math.max(32, Math.round(66 - deniedAge * driftRate * 0.32))
      drone.positionUncertaintyM = Math.round((25 + deniedAge * driftRate) * 10) / 10
      continue
    }

    const recoveryAge = runtime.elapsedSeconds - 285
    const validatedFraction = Math.max(0, Math.min(1, (recoveryAge - 15) / 60))
    const isValidated = exposureRank <= validatedFraction
    affected += isValidated ? 0 : 1
    denied += isValidated ? 0 : 1
    recovering += isValidated ? 1 : 0
    if (isValidated) {
      drone.navigationSource = 'GNSS'
      drone.positioningMethod = 'GNSS'
      drone.positioningConfidence = Math.round(76 + validatedFraction * 20 - exposureRank * 4)
      drone.positionUncertaintyM = Math.max(2, Math.round((18 - validatedFraction * 15) * 10) / 10)
    } else {
      drone.navigationSource = drone.type === 'Relay' ? 'MESH' : 'SIMULATED_VIO'
      drone.positioningMethod = drone.type === 'Relay' ? 'Mesh' : 'ORB-SLAM3 + Mesh'
      drone.positioningConfidence = Math.round(54 + recoveryAge * 0.16)
      drone.positionUncertaintyM = Math.max(12, 58 - recoveryAge * 0.42 + exposureRank * 12)
    }
  }

  runtime.affectedDrones = affected
  runtime.deniedDrones = denied
  runtime.recoveringDrones = recovering
  if (phase === 'BASELINE') {
    runtime.satellitesTracked = 15
    runtime.fixAgeSeconds = 0
    runtime.positionDisagreementM = 1.5
    state.mission.gnss = 'active'
    state.mission.fallbackPositioning = null
  } else if (phase === 'CHOPPY') {
    const pulse = 0.5 + 0.5 * Math.sin(runtime.elapsedSeconds * 0.55)
    runtime.satellitesTracked = Math.round(11 - pulse * 5)
    runtime.fixAgeSeconds = Math.round((0.6 + pulse * 3.4) * 10) / 10
    runtime.positionDisagreementM = Math.round((5 + pulse * 15) * 10) / 10
    state.mission.gnss = 'degraded'
    state.mission.fallbackPositioning = 'GNSS cross-checked by ORB-SLAM3 + Mesh'
  } else if (phase === 'DEGRADED') {
    const progress = (runtime.elapsedSeconds - 105) / 75
    runtime.satellitesTracked = Math.max(2, Math.round(8 - progress * 6))
    runtime.fixAgeSeconds = Math.round((4 + progress * 16) * 10) / 10
    runtime.positionDisagreementM = Math.round((18 + progress * 42) * 10) / 10
    state.mission.gnss = 'degraded'
    state.mission.fallbackPositioning = 'ORB-SLAM3 + Mesh validation'
  } else if (phase === 'DENIED') {
    runtime.satellitesTracked = 0
    runtime.fixAgeSeconds = Math.round(runtime.elapsedSeconds - 180)
    runtime.positionDisagreementM = Math.round(60 + (runtime.elapsedSeconds - 180) * 0.45)
    state.mission.gnss = 'denied'
    state.mission.fallbackPositioning = 'ORB-SLAM3 + Mesh + IMU'
  } else if (phase === 'RECOVERING') {
    const progress = (runtime.elapsedSeconds - 285) / 75
    runtime.satellitesTracked = Math.round(4 + progress * 10)
    runtime.fixAgeSeconds = Math.max(0, Math.round((15 - progress * 15) * 10) / 10)
    runtime.positionDisagreementM = Math.max(2, Math.round((45 - progress * 43) * 10) / 10)
    state.mission.gnss = 'degraded'
    state.mission.fallbackPositioning = 'Integrity-checking GNSS against ORB-SLAM3 + Mesh'
  } else {
    runtime.satellitesTracked = 15
    runtime.fixAgeSeconds = 0
    runtime.positionDisagreementM = 1.5
    runtime.affectedDrones = 0
    runtime.deniedDrones = 0
    runtime.recoveringDrones = state.drones.length
    runtime.active = false
    runtime.completedAt = now
    state.mission.gnss = 'active'
    state.mission.fallbackPositioning = null
  }
}

function resolveInterceptContacts(
  state: C2State,
  now: number,
  previousDronePositions: Map<string, Position>,
  previousTrackPositions: Map<string, Position>,
): void {
  for (const drone of state.drones) {
    if (!drone.assignedTrackId || drone.lifecycle === 'FAULT') continue
    const track = state.tracks.find((candidate) => candidate.id === drone.assignedTrackId)
    if (!track || track.scenario?.phase === 'neutralized') continue
    const previousDrone = previousDronePositions.get(drone.id) ?? drone.position
    const previousTrack = previousTrackPositions.get(track.id) ?? track.position
    const contact = closestPointTime(previousDrone, drone.position, previousTrack, track.position)
    if (contact.distance > INTERCEPT_CONTACT_METERS) continue

    const trackId = track.id
    const droneAtContact = interpolatePosition(previousDrone, drone.position, contact.time)
    const trackAtContact = interpolatePosition(previousTrack, track.position, contact.time)
    const contactPosition: Position = {
      lng: (droneAtContact.lng + trackAtContact.lng) / 2,
      lat: (droneAtContact.lat + trackAtContact.lat) / 2,
      alt: (droneAtContact.alt + trackAtContact.alt) / 2,
    }
    drone.position = { ...contactPosition }
    track.position = { ...contactPosition }
    track.altitude = contactPosition.alt
    drone.lifecycle = 'FAULT'
    drone.speed = 0
    drone.payloadStatus = 'Expended'
    drone.assignedTrackId = null
    if (track.scenario) {
      if (track.scenario.phase === 'impact' && track.scenario.impactAt === now && state.scenario) {
        state.scenario.impacts = Math.max(0, state.scenario.impacts - 1)
      }
      track.scenario.phase = 'neutralized'
      track.scenario.currentSpeed = 0
      delete track.scenario.impactAt
    }
    track.recommendedAction = 'Neutralized'

    for (const wingman of state.drones) {
      if (wingman.assignedTrackId === trackId) wingman.assignedTrackId = null
    }
    state.recommendations = state.recommendations.filter(
      (recommendation) => recommendation.trackId !== trackId,
    )
    state.decisionLog.unshift({
      id: `log-${now}-${trackId}-neutralized`,
      timestamp: now,
      actor: 'system',
      action: 'INTERCEPT_CONTACT',
      detail: `${drone.id} contacted ${trackId}; both vehicles neutralized`,
    })
  }
}

export function advanceSimulation(
  state: C2State,
  options: { simulateDrones?: boolean; now?: number } = {},
): void {
  state.tick += 1
  const now = options.now ?? Date.now()
  const asset = state.mission.protectedAsset
  const hold = state.mission.state === 'HOLD' || state.mission.state === 'RECALL'
  const stepSeconds = SIMULATION_TICK_SECONDS * (state.scenario?.timelineScale ?? 1)
  const previousDronePositions = new Map(
    state.drones.map((drone) => [drone.id, { ...drone.position }]),
  )
  const previousTrackPositions = new Map(
    state.tracks.map((track) => [track.id, { ...track.position }]),
  )

  for (const drone of options.simulateDrones === false ? [] : state.drones) {
    if (hold || drone.lifecycle === 'FAULT') continue

    if (drone.assignedTrackId) {
      const track = state.tracks.find((t) => t.id === drone.assignedTrackId)
      if (track && track.scenario?.phase !== 'neutralized') {
        if (state.scenario?.active) {
          const movement = advanceKinematic(
            drone.position,
            drone.bearing ?? bearingTo(drone.position, track.position),
            drone.speed ?? 0,
            INTERCEPTOR_SPEED_MPS,
            track.position,
            INTERCEPTOR_ACCELERATION_MPS2,
            INTERCEPTOR_TURN_RATE_DPS,
            stepSeconds,
          )
          drone.position = movement.position
          drone.bearing = movement.bearing
          drone.speed = movement.speed
        } else {
          const blend = 0.08
          drone.position = {
            lng: drone.position.lng + (track.position.lng - drone.position.lng) * blend,
            lat: drone.position.lat + (track.position.lat - drone.position.lat) * blend,
            alt: drone.position.alt + (track.position.alt - drone.position.alt) * blend,
          }
        }
        if (drone.battery > 5) drone.battery = Math.max(5, drone.battery - 0.01)
        continue
      }
    }

    const phase =
      drone.id.charCodeAt(drone.id.length - 1) * 0.4 +
      (drone.type === 'Scout' ? 1 : 0)
    const radius =
      drone.type === 'Scout' ? 0.004 : drone.type === 'Relay' ? 0.0015 : 0.0025
    const offset = orbitOffset(state.tick * 0.02, radius, phase)
    const orbitCenter = state.scenario && GNSS_FADE_SCENARIO_IDS.includes(state.scenario.id as typeof GNSS_FADE_SCENARIO_IDS[number])
      ? (drone.scenarioAnchor ?? drone.position)
      : asset
    const orbitScale = state.scenario && GNSS_FADE_SCENARIO_IDS.includes(state.scenario.id as typeof GNSS_FADE_SCENARIO_IDS[number]) ? 0.35 : 1
    drone.position = {
      lng: drone.position.lng * 0.98 + (orbitCenter.lng + offset.lng * orbitScale) * 0.02,
      lat: drone.position.lat * 0.98 + (orbitCenter.lat + offset.lat * orbitScale) * 0.02,
      alt: drone.position.alt,
    }
  }

  if (!hold && state.scenario?.active) {
    if (GNSS_FADE_SCENARIO_IDS.includes(state.scenario.id as typeof GNSS_FADE_SCENARIO_IDS[number])) {
      advanceGnssFadeScenario(state, now, stepSeconds)
    } else if (THALES_RADAR_REPLAY_IDS.includes(state.scenario.id)) {
      advanceThalesRadarReplay(state, now, stepSeconds)
    } else {
      advanceScenarioTracks(state, now, stepSeconds)
    }
  } else if (!hold) {
    for (const track of state.tracks) {
      if (track.scenario?.phase === 'neutralized') continue
      const vel = THREAT_VELOCITY[track.id] ?? { dLng: -0.00002, dLat: -0.00002 }
      track.position = {
        lng: track.position.lng + vel.dLng,
        lat: track.position.lat + vel.dLat,
        alt: track.altitude,
      }
      const dLat = (track.position.lat - asset.lat) * 111_320
      const dLng =
        (track.position.lng - asset.lng) *
        111_320 *
        Math.cos((track.position.lat * Math.PI) / 180)
      const dist = Math.hypot(dLat, dLng)
      track.etaToAsset = Math.max(5, Math.round(dist / Math.max(track.speed, 1)))
    }
  }

  if (!hold) {
    resolveInterceptContacts(state, now, previousDronePositions, previousTrackPositions)
  }

  // Auto-generate plans for interceptable tracks without active tasking.
  if (state.tick === 1 || state.tick % 20 === 0) {
    for (const track of state.tracks) {
      if (
        track.recommendedAction !== 'Intercept' ||
        track.scenario?.phase === 'impact' ||
        track.scenario?.phase === 'neutralized'
      ) continue
      const pending = state.recommendations.find(
        (r) => r.trackId === track.id && r.status === 'pending',
      )
      const confirmed = state.recommendations.find(
        (r) => r.trackId === track.id && r.status === 'confirmed',
      )
      if (pending || confirmed) continue

      const rec = buildRecommendation(track, state.drones)
      if (!rec) continue
      upsertRecommendation(state, rec)
      state.decisionLog.unshift({
        id: `log-${now}-${rec.id}`,
        timestamp: now,
        actor: 'system',
        action: 'RECOMMEND',
        detail: rec.summary,
      })
    }
  }

  // Refresh route waypoints for pending/confirmed plans.
  for (const rec of state.recommendations) {
    if (rec.status !== 'pending' && rec.status !== 'confirmed') continue
    const track = state.tracks.find((t) => t.id === rec.trackId)
    const primary = state.drones.find((d) => d.id === rec.droneIds[0])
    if (!track || !primary) continue
    rec.route = {
      waypoints: [
        primary.position,
        {
          lng: (primary.position.lng + track.position.lng) / 2,
          lat: (primary.position.lat + track.position.lat) / 2,
          alt: (primary.position.alt + track.position.alt) / 2,
        },
        track.position,
      ],
    }
  }
}

export function upsertRecommendation(
  state: C2State,
  rec: TaskingRecommendation,
): void {
  const idx = state.recommendations.findIndex(
    (r) => r.id === rec.id || r.trackId === rec.trackId,
  )
  if (idx >= 0) state.recommendations[idx] = rec
  else state.recommendations.push(rec)
}
