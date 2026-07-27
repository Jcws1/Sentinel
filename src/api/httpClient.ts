import type { SentinelC2Client } from './client'
import { API_ROUTES } from './client'
import type {
  DecisionLogDto,
  FusionTrackDetailDto,
  FusionTracksDto,
  MissionSnapshotDto,
  MissionStatusDto,
  PolicyDto,
  RealtimeEvent,
  TaskingDecisionRequest,
  TaskingPlanRequest,
  TelemetryDto,
} from './types'
import type { MissionState, TaskingRecommendation } from '../types'
import { operatorHeaders } from './operatorAuth'

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...operatorHeaders(),
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string
    } | null
    throw new Error(body?.error ?? `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${API_ROUTES.realtime}`
}

export function createHttpC2Client(): SentinelC2Client {
  return {
    connect(onEvent, onStatus) {
      let socket: WebSocket | null = null
      let closed = false
      let retryTimer: number | null = null

      const connectSocket = () => {
        if (closed) return
        onStatus?.('connecting')
        socket = new WebSocket(wsUrl())

        socket.addEventListener('open', () => {
          onStatus?.('open')
          void apiRequest<MissionSnapshotDto>('/api/v1/snapshot')
            .then((snapshot) => {
              onEvent({ type: 'state.snapshot', payload: snapshot })
            })
            .catch(() => {
              // Snapshot will arrive on the next WS message.
            })
        })

        socket.addEventListener('message', (message) => {
          try {
            const event = JSON.parse(String(message.data)) as RealtimeEvent
            onEvent(event)
          } catch {
            // Ignore malformed frames.
          }
        })

        socket.addEventListener('close', () => {
          onStatus?.('closed')
          if (closed) return
          retryTimer = window.setTimeout(connectSocket, 1500)
        })

        socket.addEventListener('error', () => {
          socket?.close()
        })
      }

      connectSocket()

      return () => {
        closed = true
        if (retryTimer) window.clearTimeout(retryTimer)
        socket?.close()
      }
    },


    getMissionStatus() {
      return apiRequest<MissionStatusDto>(API_ROUTES.mission)
    },

    getTracks() {
      return apiRequest<FusionTracksDto>(API_ROUTES.tracks)
    },

    getTrackDetail(trackId) {
      return apiRequest<FusionTrackDetailDto>(API_ROUTES.trackDetail(trackId))
    },

    getTelemetry() {
      return apiRequest<TelemetryDto>(API_ROUTES.telemetry)
    },

    getPolicy() {
      return apiRequest<PolicyDto>(API_ROUTES.policy)
    },

    getDecisionLog() {
      return apiRequest<DecisionLogDto>(API_ROUTES.decisions)
    },

    requestPlan(body: TaskingPlanRequest) {
      return apiRequest<TaskingRecommendation>(API_ROUTES.taskingPlan, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    engageTrack(trackId: string) {
      return apiRequest<{ accepted: boolean; trackId: string; droneIds: string[] }>(
        API_ROUTES.taskingEngage,
        {
          method: 'POST',
          body: JSON.stringify({ trackId }),
        },
      )
    },

    submitDecision(body: TaskingDecisionRequest) {
      return apiRequest<{ accepted: boolean }>(API_ROUTES.taskingDecision, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    abortEngagement(trackId: string) {
      return apiRequest<{ accepted: boolean }>(API_ROUTES.taskingAbort, {
        method: 'POST',
        body: JSON.stringify({ trackId }),
      })
    },

    holdTrack(trackId: string) {
      return apiRequest<{ accepted: boolean }>(API_ROUTES.trackHold(trackId), {
        method: 'POST',
      })
    },

    setMissionState(state: MissionState) {
      return apiRequest<MissionStatusDto>(API_ROUTES.mission, {
        method: 'PATCH',
        body: JSON.stringify({ state }),
      })
    },
  }
}
