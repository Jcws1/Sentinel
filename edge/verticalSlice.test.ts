import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import type { SimSnapshot } from '../src/api/simTypes'
import { SensorSimulator } from '../sensor-sim/simulator'
import { SimGatewayClient } from '../server/simGateway'
import { createEdgeGateway } from './server'

async function startTruthGateway() {
  const snapshot: SimSnapshot = {
    scenarioId: 'vertical-slice',
    origin: { latDeg: 1.3521, lngDeg: 103.8198, elevationM: 15 },
    vehicles: [
      {
        vehicleId: 'quad-1',
        platformId: 'commercial-quad',
        displayName: 'Quad 1',
        role: 'scout',
        groupId: null,
        controlBackend: 'gazebo_velocity',
        lifecycle: 'ACTIVE',
        source: 'runtime',
        pose: {
          frame: 'LOCAL_ENU',
          eastM: 100,
          northM: 100,
          upM: 30,
          rollRad: 0,
          pitchRad: 0,
          yawRad: 0,
        },
        velocity: { eastMS: 1, northMS: 0, upMS: 0 },
        updatedAt: '2026-07-27T00:00:00.000Z',
      },
    ],
    faults: [],
  }
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/v1/visual-sensors' && req.method === 'POST') {
      res.statusCode = 201
      res.end(JSON.stringify({ lifecycle: 'ACTIVE' }))
      return
    }
    if (req.url === '/v1/handshake') {
      res.end(
        JSON.stringify({
          protocol: 'sentinel-sim',
          version: '1.0',
          scenarioId: snapshot.scenarioId,
          worldName: 'test',
          coordinateFrame: 'ENU',
          origin: snapshot.origin,
          limits: { maxVehicles: 32, px4HotSpawn: false },
          capabilities: ['vehicle.telemetry'],
        }),
      )
      return
    }
    if (req.url === '/v1/platforms') {
      res.end(JSON.stringify({ platforms: [] }))
      return
    }
    if (req.url === '/v1/state') {
      res.end(JSON.stringify(snapshot))
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  const sockets = new WebSocketServer({ server, path: '/v1/events' })
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = server.address()
  assert(address && typeof address !== 'string')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>((resolve) => sockets.close(() => resolve()))
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

async function waitForObservations(baseUrl: string) {
  const deadline = Date.now() + 4_000
  while (Date.now() < deadline) {
    const result = (await fetch(`${baseUrl}/v1/observations`).then((response) =>
      response.json(),
    )) as { observations: unknown[] }
    if (result.observations.length >= 2) return result.observations
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('sensor observations did not reach the edge gateway')
}

test('standalone sensor simulator publishes Gazebo-derived radar and RF inputs through edge', async () => {
  const truth = await startTruthGateway()
  const edge = createEdgeGateway({
    upstreamSimulatorUrl: truth.url,
    sensorSimulatorUrl: 'http://127.0.0.1:2',
    producerToken: 'vertical-slice-token',
  })
  await new Promise<void>((resolve) =>
    edge.server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = edge.server.address()
  assert(address && typeof address !== 'string')
  const edgeUrl = `http://127.0.0.1:${address.port}`
  const c2Adapter = new SimGatewayClient(edgeUrl)
  const simulator = new SensorSimulator({
    edgeGatewayUrl: edgeUrl,
    gazeboGatewayUrl: truth.url,
    producerToken: 'vertical-slice-token',
    scenarioSeed: 'vertical-slice-seed',
  })

  try {
    const proxiedSnapshot = await c2Adapter.refresh()
    assert.equal(proxiedSnapshot.scenarioId, 'vertical-slice')
    assert.equal(proxiedSnapshot.vehicles[0].vehicleId, 'quad-1')
    await simulator.start()
    const observations = (await waitForObservations(edgeUrl)) as Array<{
      source: { mode: string }
      measurement: { modality: string }
      gateway: { ingressSequence: number }
    }>
    assert.deepEqual(
      new Set(observations.map((item) => item.measurement.modality)),
      new Set(['radar', 'rf']),
    )
    assert(observations.every((item) => item.source.mode === 'SIMULATED'))
    assert(observations.every((item) => item.gateway.ingressSequence > 0))
    assert(
      simulator
        .listSensors()
        .every((sensor) => sensor.visualState === 'ACTIVE'),
    )
  } finally {
    simulator.stop()
    await edge.close()
    await truth.close()
  }
})
