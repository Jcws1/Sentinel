import { buildRecommendation } from '../src/utils/tasking'
import type { MissionState, TaskingRecommendation } from '../src/types'
import type {
  FusionTrackDetailDto,
  TaskingDecisionRequest,
  TaskingPlanRequest,
} from '../src/api/types'
import type { C2State } from './state'
import { upsertRecommendation } from './simulation'

export function getTrackDetail(
  state: C2State,
  trackId: string,
): FusionTrackDetailDto | null {
  const track = state.tracks.find((t) => t.id === trackId)
  if (!track) return null
  return {
    track,
    provenance: track.sensors.map((sensorId, i) => ({
      sensorId,
      sensorType: (['radar', 'eo_ir', 'rf', 'acoustic'] as const)[i % 4],
      reading: track.position,
      confidence: Math.max(50, track.fusionConfidence - i * 4),
    })),
    algorithm: 'multi-sensor-kalman-v1',
    anomalies: [],
  }
}

export function requestPlan(
  state: C2State,
  body: TaskingPlanRequest,
): TaskingRecommendation {
  const track = state.tracks.find((t) => t.id === body.trackId)
  if (!track) throw new Error(`Track ${body.trackId} not found`)

  const rec = buildRecommendation(track, state.drones)
  if (!rec) throw new Error('No available interceptors')

  if (body.preferredDroneIds?.length) {
    rec.droneIds = body.preferredDroneIds
    rec.summary = `Intercept ${track.id} with ${body.preferredDroneIds.join(', ')} via direct intercept. ETA: ${rec.etaSeconds}s. Confidence: ${rec.confidence}%.`
  }

  upsertRecommendation(state, rec)
  state.decisionLog.unshift({
    id: `log-${Date.now()}-plan`,
    timestamp: Date.now(),
    actor: 'system',
    action: 'RECOMMEND',
    detail: rec.summary,
  })
  return rec
}

export function submitDecision(
  state: C2State,
  body: TaskingDecisionRequest,
): { accepted: boolean } {
  const rec = state.recommendations.find((r) => r.id === body.recommendationId)
  if (!rec) return { accepted: false }

  if (body.decision === 'confirm') {
    if (rec.status !== 'pending') return { accepted: false }

    // Only assign free interceptors; rebuild plan if originals are taken.
    let droneIds = rec.droneIds.filter((id) => {
      const drone = state.drones.find((d) => d.id === id)
      return (
        drone &&
        drone.type === 'Interceptor' &&
        (!drone.assignedTrackId || drone.assignedTrackId === rec.trackId)
      )
    })

    if (droneIds.length === 0) {
      const track = state.tracks.find((t) => t.id === rec.trackId)
      if (!track) return { accepted: false }
      const fresh = buildRecommendation(track, state.drones)
      if (!fresh) return { accepted: false }
      droneIds = fresh.droneIds
      rec.droneIds = fresh.droneIds
      rec.route = fresh.route
      rec.etaSeconds = fresh.etaSeconds
      rec.confidence = fresh.confidence
      rec.summary = fresh.summary
    } else {
      rec.droneIds = droneIds
    }

    rec.status = 'confirmed'
    rec.autoExecuteAt = null
    for (const drone of state.drones) {
      if (droneIds.includes(drone.id)) {
        drone.assignedTrackId = rec.trackId
      }
    }
    state.decisionLog.unshift({
      id: `log-${Date.now()}-confirm`,
      timestamp: Date.now(),
      actor: 'operator',
      action: 'CONFIRM',
      detail: rec.summary,
    })
    return { accepted: true }
  }

  // Veto path
  if (rec.status === 'pending') {
    rec.status = 'vetoed'
    rec.autoExecuteAt = null
    state.decisionLog.unshift({
      id: `log-${Date.now()}-veto`,
      timestamp: Date.now(),
      actor: 'operator',
      action: 'VETO',
      detail: rec.summary,
    })
  }

  if (body.intent) {
    state.decisionLog.unshift({
      id: `log-${Date.now()}-intent`,
      timestamp: Date.now(),
      actor: 'operator',
      action: body.intent,
      detail: rec.summary,
    })

    if (
      body.intent === 'REASSIGN' ||
      body.intent === 'SWAP' ||
      body.intent === 'PRIORITY_UP'
    ) {
      // Free assigned drones and issue a fresh plan.
      for (const drone of state.drones) {
        if (drone.assignedTrackId === rec.trackId) {
          drone.assignedTrackId = null
        }
      }
      state.recommendations = state.recommendations.filter(
        (r) => r.id !== rec.id,
      )
      try {
        requestPlan(state, { trackId: rec.trackId })
      } catch {
        // No assets available — leave vetoed.
      }
    }

    if (body.intent === 'IGNORE' || body.intent === 'ABORT') {
      for (const drone of state.drones) {
        if (drone.assignedTrackId === rec.trackId) {
          drone.assignedTrackId = null
        }
      }
    }
  }

  return { accepted: true }
}

/** One-shot operator engage: plan (if needed) + confirm intercept. */
export function engageTrack(
  state: C2State,
  trackId: string,
): { accepted: boolean; trackId: string; droneIds: string[] } {
  const track = state.tracks.find((t) => t.id === trackId)
  if (!track) throw new Error(`Track ${trackId} not found`)

  const already = state.recommendations.find(
    (r) => r.trackId === trackId && r.status === 'confirmed',
  )
  if (already) {
    return { accepted: true, trackId, droneIds: already.droneIds }
  }

  if (track.recommendedAction === 'Hold') {
    throw new Error('Track is on hold — clear hold before engaging')
  }

  if (state.mission.state === 'HOLD' || state.mission.state === 'RECALL') {
    throw new Error(`Mission is ${state.mission.state} — resume before engaging`)
  }

  let rec = state.recommendations.find(
    (r) => r.trackId === trackId && r.status === 'pending',
  )
  if (!rec) {
    rec = requestPlan(state, { trackId })
  }

  const result = submitDecision(state, {
    recommendationId: rec.id,
    decision: 'confirm',
  })
  if (!result.accepted) {
    throw new Error('Engage rejected — no available interceptors')
  }

  const confirmed = state.recommendations.find(
    (r) => r.trackId === trackId && r.status === 'confirmed',
  )
  state.decisionLog.unshift({
    id: `log-${Date.now()}-engage`,
    timestamp: Date.now(),
    actor: 'operator',
    action: 'ENGAGE',
    detail: confirmed?.summary ?? `Engaged ${trackId}`,
  })

  return {
    accepted: true,
    trackId,
    droneIds: confirmed?.droneIds ?? rec.droneIds,
  }
}

export function abortEngagement(
  state: C2State,
  trackId: string,
): { accepted: boolean } {
  const rec = state.recommendations.find(
    (r) => r.trackId === trackId && r.status === 'confirmed',
  )
  if (!rec) return { accepted: false }

  rec.status = 'vetoed'
  rec.autoExecuteAt = null
  for (const drone of state.drones) {
    if (drone.assignedTrackId === trackId) {
      drone.assignedTrackId = null
    }
  }
  state.decisionLog.unshift({
    id: `log-${Date.now()}-abort`,
    timestamp: Date.now(),
    actor: 'operator',
    action: 'ABORT',
    detail: `Aborted engagement on ${trackId}`,
  })
  return { accepted: true }
}

export function holdTrack(
  state: C2State,
  trackId: string,
): { accepted: boolean } {
  const track = state.tracks.find((t) => t.id === trackId)
  if (!track) return { accepted: false }

  track.recommendedAction = 'Hold'
  const pending = state.recommendations.find(
    (r) => r.trackId === trackId && r.status === 'pending',
  )
  if (pending) {
    pending.status = 'vetoed'
    pending.autoExecuteAt = null
  }
  state.decisionLog.unshift({
    id: `log-${Date.now()}-hold`,
    timestamp: Date.now(),
    actor: 'operator',
    action: 'HOLD',
    detail: `Track ${trackId} placed on hold`,
  })
  return { accepted: true }
}

export function setMissionState(
  state: C2State,
  next: MissionState,
): C2State['mission'] {
  state.mission.state = next
  if (next === 'RECALL') {
    for (const drone of state.drones) {
      drone.assignedTrackId = null
    }
    for (const rec of state.recommendations) {
      if (rec.status === 'pending' || rec.status === 'confirmed') {
        rec.status = 'vetoed'
      }
    }
  }
  state.decisionLog.unshift({
    id: `log-${Date.now()}-mission`,
    timestamp: Date.now(),
    actor: 'operator',
    action: `MISSION_${next}`,
    detail: `Mission state set to ${next}`,
  })
  return state.mission
}

export function buildSnapshot(state: C2State) {
  return {
    missionId: state.missionId,
    mission: state.mission,
    tracks: state.tracks,
    drones: state.drones,
    recommendations: state.recommendations,
    decisionLog: state.decisionLog.slice(0, 100),
    policy: state.policy,
    alertTrackIds: state.tracks
      .filter((t) => t.threatClass === 'I' && t.etaToAsset < 50)
      .map((t) => t.id),
  }
}
