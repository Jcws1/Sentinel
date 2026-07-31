import assert from 'node:assert/strict'
import test from 'node:test'
import { createEdgeGateway } from './server'

async function startGateway() {
  const gateway = createEdgeGateway({
    upstreamSimulatorUrl: 'http://127.0.0.1:1',
    sensorSimulatorUrl: 'http://127.0.0.1:2',
    producerToken: 'test-token',
  })
  await new Promise<void>((resolve) =>
    gateway.server.listen(0, '127.0.0.1', () => resolve()),
  )
  const address = gateway.server.address()
  assert(address && typeof address !== 'string')
  return {
    gateway,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

test('edge producer routes require the producer token', async () => {
  const { gateway, baseUrl } = await startGateway()
  try {
    const response = await fetch(`${baseUrl}/v1/sources/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(response.status, 401)
  } finally {
    await gateway.close()
  }
})

test('edge gateway registers a standalone simulated producer', async () => {
  const { gateway, baseUrl } = await startGateway()
  try {
    const response = await fetch(`${baseUrl}/v1/sources/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-edge-token': 'test-token',
      },
      body: JSON.stringify({
        schemaVersion: '1.0',
        sourceId: 'sensor-sim',
        displayName: 'Sensor simulator',
        sourceKind: 'SENSOR',
        mode: 'SIMULATED',
        adapterType: 'test',
        capabilities: ['sensor.radar'],
        instanceId: 'instance-1',
        startedAt: '2026-07-27T00:00:00.000Z',
      }),
    })
    assert.equal(response.status, 201)
    const sources = await fetch(`${baseUrl}/v1/sources`).then((item) =>
      item.json(),
    ) as { sources: Array<{ sourceId: string }> }
    assert.equal(sources.sources[0].sourceId, 'sensor-sim')
  } finally {
    await gateway.close()
  }
})

test('edge gateway exports accepted observations as replayable NDJSON', async () => {
  const { gateway, baseUrl } = await startGateway()
  try {
    gateway.registry.register({
      schemaVersion: '1.0',
      sourceId: 'sensor-sim',
      displayName: 'Sensor simulator',
      sourceKind: 'SENSOR',
      mode: 'SIMULATED',
      adapterType: 'test',
      capabilities: ['sensor.radar'],
      instanceId: 'instance-1',
      startedAt: '2026-07-27T00:00:00.000Z',
    })
    gateway.registry.publish({
      observations: [{
        schemaVersion: '1.0',
        observationId: 'observation-1',
        source: {
          sourceId: 'sensor-sim',
          instanceId: 'instance-1',
          sensorId: 'radar-1',
          sensorTypeId: 'radar-test',
          adapterType: 'test',
          configurationRevision: 1,
          mode: 'SIMULATED',
        },
        sequence: 1,
        time: {
          observedAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          clockQuality: 'estimated',
        },
        frame: { id: 'radar-1', convention: 'SENSOR_POLAR' },
        measurement: {
          modality: 'radar',
          rangeM: 100,
          bearingRad: 0,
          elevationRad: 0,
          radialVelocityMS: 0,
          signalToNoiseDb: 20,
        },
        quality: {
          detectionConfidence: 0.8,
          covariance: [4],
          processingLevel: 'measurement',
          staleAfterMs: 2_000,
        },
      }],
    })
    const response = await fetch(
      `${baseUrl}/v1/recordings/current.ndjson`,
    )
    assert.equal(response.status, 200)
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/x-ndjson/,
    )
    const lines = (await response.text()).trim().split('\n')
    assert.equal(lines.length, 1)
    const exported = JSON.parse(lines[0]) as {
      observationId: string
      gateway: { ingressSequence: number }
    }
    assert.equal(exported.observationId, 'observation-1')
    assert.equal(exported.gateway.ingressSequence, 1)
  } finally {
    await gateway.close()
  }
})
