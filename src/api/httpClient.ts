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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
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
          void request<MissionSnapshotDto>('/api/v1/snapshot')
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
      return request<MissionStatusDto>(API_ROUTES.mission)
    },

    getTracks() {
      return request<FusionTracksDto>(API_ROUTES.tracks)
    },

    getTrackDetail(trackId) {
      return request<FusionTrackDetailDto>(API_ROUTES.trackDetail(trackId))
    },

    getTelemetry() {
      return request<TelemetryDto>(API_ROUTES.telemetry)
    },

    getPolicy() {
      return request<PolicyDto>(API_ROUTES.policy)
    },

    getDecisionLog() {
      return request<DecisionLogDto>(API_ROUTES.decisions)
    },

    requestPlan(body: TaskingPlanRequest) {
      return request<TaskingRecommendation>(API_ROUTES.taskingPlan, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    engageTrack(trackId: string) {
      return request<{ accepted: boolean; trackId: string; droneIds: string[] }>(
        API_ROUTES.taskingEngage,
        {
          method: 'POST',
          body: JSON.stringify({ trackId }),
        },
      )
    },

    submitDecision(body: TaskingDecisionRequest) {
      return request<{ accepted: boolean }>(API_ROUTES.taskingDecision, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },

    abortEngagement(trackId: string) {
      return request<{ accepted: boolean }>(API_ROUTES.taskingAbort, {
        method: 'POST',
        body: JSON.stringify({ trackId }),
      })
    },

    holdTrack(trackId: string) {
      return request<{ accepted: boolean }>(API_ROUTES.trackHold(trackId), {
        method: 'POST',
      })
    },

    setMissionState(state: MissionState) {
      return request<MissionStatusDto>(API_ROUTES.mission, {
        method: 'PATCH',
        body: JSON.stringify({ state }),
      })
    },
  }
}
