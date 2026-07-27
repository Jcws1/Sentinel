import http from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, type WebSocket } from 'ws'
import type { MissionState } from '../src/types'
import type {
  SimBatchSpawnRequest,
  RealtimeEvent,
  TaskingDecisionRequest,
  TaskingPlanRequest,
} from '../src/api/types'
import type {
  SimCommand,
  SimFleetBehaviorRequest,
  SimFault,
  SimSnapshot,
  SimSpawnRequest,
} from '../src/api/simTypes'
import type {
  AssignmentPlan,
  OperationalObjective,
} from '../src/types/missionPlanning'
import type { SavedScenario } from '../src/api/scenarioTypes'
import { createInitialState, toDecisionLogDto } from './state'
import { advanceSimulation } from './simulation'
import { createCdsePoller } from './cdsePoller'
import { createHealthDatabase } from './healthDatabase'
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
import { loadEnvFile } from './loadEnv'
import { getCdseConfig } from './cdseConfig'
import { registerCdseRoutes } from './cdseRoutes'
import { SimGatewayClient, syncGatewayFleet } from './simGateway'
import { createScenarioDatabase } from './scenarioDatabase'
import { registerScenarioRoutes } from './scenarioRoutes'
import { PairingAuth, registerPairingRoutes } from './pairingAuth'
import { optimizeAssignments } from './missionOptimizer'

loadEnvFile()

const PORT = Number(process.env.C2_PORT ?? 3001)
const HOST = process.env.C2_HOST?.trim() || '0.0.0.0'
const state = createInitialState()
const clients = new Set<WebSocket>()
const edgeMapRoot = path.resolve(process.env.EDGE_MAP_ROOT ?? path.join(process.cwd(), 'edge-map'))
const uiRoot = path.resolve(process.env.UI_DIST_ROOT ?? path.join(process.cwd(), 'dist'))
const healthDatabase = createHealthDatabase()
const scenarioDatabase = createScenarioDatabase()
const simGateway = new SimGatewayClient()
const pairingAuth = new PairingAuth()
const assignmentPlans = new Map<string, AssignmentPlan>()
const assignmentObjectives = new Map<string, OperationalObjective[]>()
const cdsePoller = createCdsePoller({
  onPollCompleted: (record) => healthDatabase.recordCdsePoll(record),
})

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
registerPairingRoutes(app, pairingAuth)
app.use('/api/v1', pairingAuth.requireOperator)
registerPmtilesRoutes(app)
registerCdseRoutes(app)
registerScenarioRoutes(app, scenarioDatabase, activateSimulatorScenario)

app.get('/api/v1/edge-map/health', async (_req, res) => {
  try {
    const raw = await readFile(path.join(edgeMapRoot, 'manifest.json'), 'utf8')
    const manifest = JSON.parse(raw) as {
      id?: string
      generatedAt?: string
      refreshAfter?: string
      coverage?: { name?: string }
      resources?: Record<string, boolean | string>
    }
    const refreshAfter = manifest.refreshAfter ? Date.parse(manifest.refreshAfter) : Number.NaN
    res.json({
      ok: true,
      packId: manifest.id ?? 'unknown',
      coverage: manifest.coverage?.name ?? 'unknown',
      generatedAt: manifest.generatedAt ?? null,
      refreshAfter: manifest.refreshAfter ?? null,
      stale: Number.isFinite(refreshAfter) ? Date.now() > refreshAfter : false,
      resources: manifest.resources ?? {},
    })
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Edge map pack unavailable',
    })
  }
})

app.get('/api/v1/sensors/cdse', (_req, res) => {
  res.json(cdsePoller.snapshot())
})

const CDSE_HISTORY_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
} as const

app.get('/api/v1/sensors/cdse/history', (req, res) => {
  const requestedWindow = typeof req.query.window === 'string' ? req.query.window : '30d'
  const window = requestedWindow in CDSE_HISTORY_WINDOWS
    ? requestedWindow as keyof typeof CDSE_HISTORY_WINDOWS
    : '30d'
  const since = new Date(Date.now() - CDSE_HISTORY_WINDOWS[window]).toISOString()
  const points = healthDatabase.getCdseHistory(since)
  const successful = points.filter((point) => point.status === 'healthy')
  const totalDuration = points.reduce((sum, point) => sum + point.durationMs, 0)
  res.json({
    window,
    points,
    summary: {
      total: points.length,
      successful: successful.length,
      failed: points.length - successful.length,
      successRate: points.length ? successful.length / points.length : null,
      averageDurationMs: points.length ? Math.round(totalDuration / points.length) : null,
    },
  })
})

app.use(
  '/edge-map',
  express.static(edgeMapRoot, {
    fallthrough: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('manifest.json') || filePath.endsWith('style.json')) {
        res.setHeader('Cache-Control', 'no-cache')
      } else {
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable')
      }
    },
  }),
)

app.get('/api/v1/health', (_req, res) => {
  const cdse = getCdseConfig()
  res.json({
    ok: true,
    missionId: state.missionId,
    tick: state.tick,
    clients: clients.size,
    cdse: {
      configured: cdse.configured,
      endpoint: cdse.endpoint,
      bucket: cdse.bucket,
    },
  })
})

if (existsSync(path.join(uiRoot, 'index.html'))) {
  app.use(express.static(uiRoot, { index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/edge-map/')) {
      next()
      return
    }
    res.sendFile(path.join(uiRoot, 'index.html'))
  })
}

app.get('/api/v1/sim/status', (_req, res) => {
  res.json(simGateway.status)
})

app.get('/api/v1/sim/platforms', (_req, res) => {
  if (!simGateway.handshake) {
    res.status(503).json({ error: simGateway.status.error ?? 'Simulator offline' })
    return
  }
  res.json({ platforms: simGateway.platforms })
})

app.get('/api/v1/sim/state', (_req, res) => {
  if (!simGateway.snapshot) {
    res.status(503).json({ error: simGateway.status.error ?? 'Simulator offline' })
    return
  }
  res.json(simGateway.snapshot)
})

app.post('/api/v1/sim/vehicles', async (req, res) => {
  try {
    const vehicle = await simGateway.spawn(req.body as SimSpawnRequest)
    const snapshot = await simGateway.refresh()
    if (simGateway.handshake) syncGatewayFleet(state, snapshot, simGateway.handshake)
    broadcastSnapshot()
    res.status(201).json(vehicle)
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Vehicle spawn failed',
    })
  }
})

app.post('/api/v1/sim/vehicles/batch', async (req, res) => {
  try {
    const vehicles = await simGateway.spawnBatch(
      req.body as SimBatchSpawnRequest,
    )
    const snapshot = await simGateway.refresh()
    if (simGateway.handshake) {
      syncGatewayFleet(state, snapshot, simGateway.handshake)
    }
    broadcastSnapshot()
    res.status(201).json({
      requestedCount: vehicles.length,
      vehicles,
    })
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error ? error.message : 'Fleet batch spawn failed',
    })
  }
})

app.delete('/api/v1/sim/vehicles/:id', async (req, res) => {
  try {
    const vehicle = await simGateway.remove(req.params.id)
    const snapshot = await simGateway.refresh()
    if (simGateway.handshake) syncGatewayFleet(state, snapshot, simGateway.handshake)
    broadcastSnapshot()
    res.json(vehicle)
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Vehicle removal failed',
    })
  }
})

app.post('/api/v1/sim/commands', async (req, res) => {
  try {
    res.json(await simGateway.command(req.body as SimCommand))
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Simulator command failed',
    })
  }
})

app.post('/api/v1/sim/faults', async (req, res) => {
  try {
    res.json(
      await simGateway.injectFault(req.body as Omit<SimFault, 'updatedAt'>),
    )
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Fault injection failed',
    })
  }
})

app.post('/api/v1/sim/camera', async (req, res) => {
  try {
    res.json(await simGateway.camera(req.body))
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Camera command failed',
    })
  }
})

app.post('/api/v1/sim/fleet/behaviors', async (req, res) => {
  try {
    res.json(
      await simGateway.fleetBehavior(req.body as SimFleetBehaviorRequest),
    )
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Fleet behavior failed',
    })
  }
})

app.post('/api/v1/sim/fleet/waypoint', async (req, res) => {
  try {
    res.json(await simGateway.fleetWaypoint(req.body))
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Swarm waypoint failed',
    })
  }
})

async function executeAssignmentPlan(
  plan: AssignmentPlan,
  objectives: OperationalObjective[],
): Promise<void> {
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]))
  for (const assignment of plan.assignments) {
    const drone = state.drones.find((item) => item.id === assignment.vehicleId)
    const objective = objectiveById.get(assignment.objectiveId)
    if (!drone || !objective) continue
    drone.assignedTrackId = assignment.objectiveId
    const origin = simGateway.handshake?.origin
    if (!origin) continue
    try {
      if (objective.type === 'hold') {
        await simGateway.command({
          commandId: `mission-${plan.id}-${drone.id}`,
          vehicleId: drone.id,
          kind: 'stop',
        })
      } else {
        const target =
          objective.type === 'return'
            ? { lat: origin.latDeg, lng: origin.lngDeg, alt: origin.elevationM + 3 }
            : objective.targetPosition
        if (!target) continue
        const radius = 6_378_137
        const targetPose = {
          eastM:
            ((target.lng - origin.lngDeg) * Math.PI) /
            180 *
            radius *
            Math.cos((origin.latDeg * Math.PI) / 180),
          northM:
            ((target.lat - origin.latDeg) * Math.PI) / 180 * radius,
          upM: Math.max(2, target.alt - origin.elevationM),
        }
        await simGateway.command({
          commandId: `mission-${plan.id}-${drone.id}`,
          vehicleId: drone.id,
          kind: 'goto',
          targetPose,
          maxSpeedMS: drone.type === 'Interceptor' ? 8 : 4,
        })
      }
    } catch (error) {
      state.decisionLog.unshift({
        id: `log-${Date.now()}-${assignment.vehicleId}`,
        timestamp: Date.now(),
        actor: 'system',
        action: 'MISSION_DISPATCH_FAILED',
        detail: `${assignment.vehicleId}: ${
          error instanceof Error ? error.message : 'simulator command failed'
        }`,
      })
    }
  }
  state.decisionLog.unshift({
    id: `log-${Date.now()}-${plan.id}`,
    timestamp: Date.now(),
    actor: plan.authority === 'AUTO_EXECUTE' ? 'system' : 'operator',
    action:
      plan.authority === 'AUTO_EXECUTE'
        ? 'MISSION_AUTO_EXECUTE'
        : 'MISSION_CONFIRM',
    detail: plan.summary,
  })
}

async function activateSimulatorScenario(scenario: SavedScenario): Promise<void> {
  const snapshot = await simGateway.refresh()
  const handshake = simGateway.handshake
  if (!handshake) throw new Error('Simulator handshake is unavailable')
  const originDelta = Math.hypot(
    scenario.origin.latDeg - handshake.origin.latDeg,
    scenario.origin.lngDeg - handshake.origin.lngDeg,
  )
  if (originDelta > 0.000001) {
    throw new Error('Saved scenario origin does not match the running Gazebo world')
  }
  const current = snapshot.vehicles.filter(
    (vehicle) => vehicle.controlBackend === 'gazebo_velocity',
  )
  for (const vehicle of current) {
    await simGateway.remove(vehicle.vehicleId)
  }
  for (const vehicle of scenario.vehicles) {
    await simGateway.spawn(vehicle)
  }
  await simGateway.refresh()
}

app.post('/api/v1/missions/optimize', async (req, res) => {
  try {
    const objectives = req.body?.objectives as OperationalObjective[] | undefined
    if (!Array.isArray(objectives) || objectives.length === 0) {
      res.status(400).json({ error: 'At least one objective is required' })
      return
    }
    const plan = optimizeAssignments(objectives, state.drones)
    assignmentPlans.set(plan.id, plan)
    assignmentObjectives.set(plan.id, objectives)
    if (plan.status === 'AUTO_EXECUTED') {
      await executeAssignmentPlan(plan, objectives)
      broadcastSnapshot()
    }
    res.status(201).json(plan)
  } catch (error) {
    res.status(409).json({
      error: error instanceof Error ? error.message : 'Optimization failed',
    })
  }
})

app.post('/api/v1/missions/plans/:id/confirm', async (req, res) => {
  const plan = assignmentPlans.get(req.params.id)
  if (!plan) {
    res.status(404).json({ error: 'Assignment plan not found' })
    return
  }
  if (plan.status !== 'PROPOSED') {
    res.status(409).json({ error: `Plan is already ${plan.status}` })
    return
  }
  plan.status = 'CONFIRMED'
  await executeAssignmentPlan(plan, assignmentObjectives.get(plan.id) ?? [])
  broadcastSnapshot()
  res.json(plan)
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
  advanceSimulation(state, { simulateDrones: !simGateway.status.connected })
  broadcastSnapshot()
}, 400)

server.listen(PORT, HOST, () => {
  const cdse = getCdseConfig()
  console.log(`Sentinel C2 backend listening on http://${HOST}:${PORT}`)
  console.log(`WebSocket: ws://localhost:${PORT}/api/v1/ws`)
  if (pairingAuth.required) {
    console.log(`Operator pairing code: ${pairingAuth.pairingCode}`)
  }
  console.log(
    cdse.configured
      ? `CDSE S3: configured → ${cdse.endpoint} (${cdse.bucket})`
      : 'CDSE S3: not configured (set CDSE_S3_* in .env)',
  )
})

cdsePoller.start()
void simGateway.start((event) => {
  if (event.type === 'state.snapshot' && simGateway.handshake) {
    syncGatewayFleet(state, event.data as SimSnapshot, simGateway.handshake)
    broadcastSnapshot()
    return
  }
  if (
    event.type === 'vehicle.lifecycle' ||
    event.type === 'telemetry.frame' ||
    event.type === 'fault.updated'
  ) {
    if (simGateway.snapshot && simGateway.handshake) {
      syncGatewayFleet(state, simGateway.snapshot, simGateway.handshake)
      broadcastSnapshot()
    }
  }
})

function shutdown() {
  clearInterval(simTimer)
  simGateway.stop()
  cdsePoller.stop()
  healthDatabase.close()
  scenarioDatabase.checkpoint()
  scenarioDatabase.close()
  for (const client of clients) client.close()
  wss.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
