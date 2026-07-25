import type { AppDispatch } from '../store'
import { hydrateMission } from '../store/missionSlice'
import { hydrateDrones } from '../store/fleetSlice'
import { hydratePolicy } from '../store/policySlice'
import { hydrateTracks } from '../store/threatsSlice'
import { hydrateTasking } from '../store/taskingSlice'
import { hydrateWorkflow } from '../store/workflowSlice'
import {
  setConnected,
  setConnecting,
  setDisconnected,
  touchSync,
} from '../store/sessionSlice'
import { flushCommandQueue } from '../store/commandThunks'
import type { MissionSnapshotDto, RealtimeEvent } from './types'
import { createHttpC2Client } from './httpClient'
import type { SentinelC2Client } from './client'

export const c2Client: SentinelC2Client = createHttpC2Client()

let lastFingerprint = ''

function fingerprint(snapshot: MissionSnapshotDto): string {
  return [
    snapshot.mission.state,
    snapshot.mission.gnss,
    snapshot.mission.c2Link,
    ...snapshot.drones.map(
      (d) =>
        `${d.id}:${d.position.lng.toFixed(5)},${d.position.lat.toFixed(5)},${d.battery.toFixed(1)},${d.assignedTrackId ?? ''}`,
    ),
    ...snapshot.tracks.map(
      (t) =>
        `${t.id}:${t.position.lng.toFixed(5)},${t.position.lat.toFixed(5)},${t.etaToAsset},${t.fusionConfidence}`,
    ),
    ...snapshot.recommendations.map(
      (r) => `${r.id}:${r.status}:${r.droneIds.join('+')}:${r.etaSeconds}`,
    ),
    snapshot.decisionLog[0]?.id ?? '',
  ].join('|')
}

function applyEvent(dispatch: AppDispatch, event: RealtimeEvent) {
  if (event.type !== 'state.snapshot') return

  const snapshot = event.payload
  const next = fingerprint(snapshot)
  if (next === lastFingerprint) return
  lastFingerprint = next

  dispatch(hydrateMission(snapshot.mission))
  dispatch(hydrateDrones(snapshot.drones))
  dispatch(
    hydrateTracks({
      tracks: snapshot.tracks,
      alertTrackIds: snapshot.alertTrackIds,
    }),
  )
  dispatch(
    hydrateTasking({
      recommendations: snapshot.recommendations,
      decisionLog: snapshot.decisionLog.map((e) => ({
        timestamp: e.timestamp,
        action: e.action,
        detail: e.detail,
      })),
    }),
  )
  dispatch(
    hydrateWorkflow({
      recommendations: snapshot.recommendations,
      activeRecommendationId: snapshot.recommendations.find((r) => r.status === 'pending')?.id ?? null,
    }),
  )
  dispatch(
    hydratePolicy({
      zones: snapshot.policy.zones,
      rules: snapshot.policy.rules,
      summary: snapshot.policy.summary,
    }),
  )
  dispatch(
    setConnected({
      missionId: snapshot.missionId,
      policySummary: snapshot.policy.summary,
      lastSyncAt: Date.now(),
    }),
  )
  dispatch(touchSync())
  dispatch(flushCommandQueue())
}

/** Connect UI store to the local C2 backend (REST + WebSocket). */
export function connectC2Backend(dispatch: AppDispatch): () => void {
  dispatch(setConnecting())
  lastFingerprint = ''

  let sawSnapshot = false
  let socketOpen = false

  const disconnect = c2Client.connect(
    (event) => {
      if (event.type === 'state.snapshot') {
        sawSnapshot = true
        applyEvent(dispatch, event)
      }
    },
    (status) => {
      if (status === 'connecting') {
        socketOpen = false
        if (!sawSnapshot) dispatch(setConnecting())
      }
      if (status === 'open') {
        socketOpen = true
      }
      if (status === 'closed') {
        socketOpen = false
        sawSnapshot = false
        lastFingerprint = ''
        dispatch(setDisconnected('C2 link lost — reconnecting…'))
      }
    },
  )

  const bootTimer = window.setTimeout(() => {
    if (!sawSnapshot && !socketOpen) {
      dispatch(setDisconnected('Waiting for C2 backend on :3001'))
    }
  }, 2500)

  return () => {
    window.clearTimeout(bootTimer)
    disconnect()
  }
}
