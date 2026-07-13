import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, type WebSocket } from 'ws'
import type { MissionState } from '../src/types'
import type {
  RealtimeEvent,
  TaskingDecisionRequest,
  TaskingPlanRequest,
} from '../src/api/types'
import { createInitialState, toDecisionLogDto } from './state'
import { advanceSimulation } from './simulation'
import {
  abortEngagement,
  buildSnapshot,
  engageTrack,
  getTrackDetail,
  holdTrack,
  requestPlan,
  setMissionState,
  submitDecision,
} from './services'
import { registerPmtilesRoutes } from './pmtilesRoutes'

const PORT = Number(process.env.C2_PORT ?? 3001)
const state = createInitialState()
const clients = new Set<WebSocket>()

function broadcast(event: RealtimeEvent) {
  const payload = JSON.stringify(event)
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload)
  }
}

function broadcastSnapshot() {
  broadcast({
    type: 'state.snapshot',
    payload: buildSnapshot(state),
  })
}

const app = express()
app.use(cors())
app.use(express.json())
registerPmtilesRoutes(app)

app.get('/api/v1/health', (_req, res) => {
  res.json({
    ok: true,
    missionId: state.missionId,
    tick: state.tick,
    clients: clients.size,
  })
})

app.get('/api/v1/snapshot', (_req, res) => {
  res.json(buildSnapshot(state))
})

app.get('/api/v1/mission', (_req, res) => {
  res.json(state.mission)
})

app.patch('/api/v1/mission', (req, res) => {
  const next = req.body?.state as MissionState | undefined
  if (!next || !['STANDBY', 'ACTIVE', 'HOLD', 'RECALL'].includes(next)) {
    res.status(400).json({ error: 'Invalid mission state' })
    return
  }
  const mission = setMissionState(state, next)
  broadcastSnapshot()
  res.json(mission)
})

app.get('/api/v1/fusion/tracks', (_req, res) => {
  res.json({ tracks: state.tracks })
})

app.get('/api/v1/fusion/tracks/:id', (req, res) => {
  const detail = getTrackDetail(state, req.params.id)
  if (!detail) {
    res.status(404).json({ error: 'Track not found' })
    return
  }
  res.json(detail)
})

app.get('/api/v1/telemetry', (_req, res) => {
  res.json({
    drones: state.drones,
    meshLinks: state.drones.flatMap((d) =>
      d.meshLinks.map((to) => ({ from: d.id, to, quality: 0.9 })),
    ),
  })
})

app.get('/api/v1/policy', (_req, res) => {
  res.json(state.policy)
})

app.get('/api/v1/decisions', (_req, res) => {
  res.json(toDecisionLogDto(state.decisionLog))
})

app.get('/api/v1/tasking', (_req, res) => {
  res.json({ recommendations: state.recommendations })
})

app.post('/api/v1/tasking/plan', (req, res) => {
  try {
    const body = req.body as TaskingPlanRequest
    if (!body?.trackId) {
      res.status(400).json({ error: 'trackId required' })
      return
    }
    const rec = requestPlan(state, body)
    broadcastSnapshot()
    res.status(201).json(rec)
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Plan failed',
    })
  }
})

app.post('/api/v1/tasking/engage', (req, res) => {
  const trackId = req.body?.trackId as string | undefined
  if (!trackId) {
    res.status(400).json({ error: 'trackId required' })
    return
  }
  try {
    const result = engageTrack(state, trackId)
    broadcastSnapshot()
    res.json(result)
  } catch (error) {
    res.status(409).json({
      accepted: false,
      error: error instanceof Error ? error.message : 'Engage failed',
    })
  }
})

app.post('/api/v1/tasking/abort', (req, res) => {
  const trackId = req.body?.trackId as string | undefined
  if (!trackId) {
    res.status(400).json({ error: 'trackId required' })
    return
  }
  const result = abortEngagement(state, trackId)
  if (!result.accepted) {
    res.status(409).json({ accepted: false, error: 'No active engagement' })
    return
  }
  broadcastSnapshot()
  res.json(result)
})

app.post('/api/v1/tracks/:id/hold', (req, res) => {
  const result = holdTrack(state, req.params.id)
  if (!result.accepted) {
    res.status(404).json({ accepted: false, error: 'Track not found' })
    return
  }
  broadcastSnapshot()
  res.json(result)
})

app.post('/api/v1/tasking/decision', (req, res) => {
  const body = req.body as TaskingDecisionRequest
  if (!body?.recommendationId || !body?.decision) {
    res.status(400).json({ error: 'recommendationId and decision required' })
    return
  }
  if (body.decision !== 'confirm' && body.decision !== 'veto') {
    res.status(400).json({ error: 'decision must be confirm or veto' })
    return
  }
  const result = submitDecision(state, body)
  if (!result.accepted) {
    res.status(409).json({ accepted: false, error: 'Decision rejected' })
    return
  }
  broadcastSnapshot()
  res.json(result)
})

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/api/v1/ws' })

wss.on('connection', (socket) => {
  clients.add(socket)
  socket.send(
    JSON.stringify({
      type: 'state.snapshot',
      payload: buildSnapshot(state),
    } satisfies RealtimeEvent),
  )

  socket.on('close', () => {
    clients.delete(socket)
  })
})

const simTimer = setInterval(() => {
  advanceSimulation(state)
  broadcastSnapshot()
}, 400)

server.listen(PORT, () => {
  console.log(`Sentinel C2 backend listening on http://localhost:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/api/v1/ws`)
})

function shutdown() {
  clearInterval(simTimer)
  for (const client of clients) client.close()
  wss.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
