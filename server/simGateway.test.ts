import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { WebSocketServer } from 'ws'
import { SimGatewayClient } from './simGateway'
import type { SimSnapshot } from '../src/api/simTypes'

const snapshot: SimSnapshot = {
  scenarioId: 'test',
  origin: { latDeg: 1.3521, lngDeg: 103.8198, elevationM: 15 },
  vehicles: [],
  faults: [],
}

function startFakeGateway(port = 0) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/v1/handshake') {
      res.end(
        JSON.stringify({
          protocol: 'sentinel-sim',
          version: '1.0',
          scenarioId: 'test',
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
  return new Promise<{
    port: number
    close: () => Promise<void>
  }>((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      assert(address && typeof address !== 'string')
      resolve({
        port: address.port,
        close: async () => {
          for (const client of sockets.clients) client.terminate()
          await new Promise<void>((done) => sockets.close(() => done()))
          await new Promise<void>((done) => server.close(() => done()))
        },
      })
    })
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('condition did not become true')
}

test('simulator adapter reconnects after a phone/backend link outage', async () => {
  let fake = await startFakeGateway()
  const port = fake.port
  const client = new SimGatewayClient(`http://127.0.0.1:${port}`)
  await client.start(() => undefined)
  await waitFor(() => client.status.connected)
  assert.equal(client.status.compatible, true)

  await fake.close()
  await waitFor(() => !client.status.connected)
  fake = await startFakeGateway(port)
  await waitFor(() => client.status.connected, 7_000)
  assert.equal(client.status.scenarioId, 'test')

  client.stop()
  await fake.close()
})
