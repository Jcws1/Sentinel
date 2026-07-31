import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  EdgeSourceRegistration,
  SensorObservation,
} from '../contracts/edgeTypes'
import { EdgeRegistry } from './edgeRegistry'

const registration: EdgeSourceRegistration = {
  schemaVersion: '1.0',
  sourceId: 'sensor-sim',
  displayName: 'Sensor simulator',
  sourceKind: 'SENSOR',
  mode: 'SIMULATED',
  adapterType: 'test',
  capabilities: ['sensor.radar'],
  instanceId: 'instance-1',
  startedAt: '2026-07-27T00:00:00.000Z',
}

function observation(sequence = 1): SensorObservation {
  return {
    schemaVersion: '1.0',
    observationId: `observation-${sequence}`,
    source: {
      sourceId: registration.sourceId,
      instanceId: registration.instanceId,
      sensorId: 'radar-1',
      sensorTypeId: 'radar-test',
      adapterType: 'test',
      configurationRevision: 1,
      mode: 'SIMULATED',
    },
    sequence,
    time: {
      observedAt: '2026-07-27T00:00:00.000Z',
      sentAt: '2026-07-27T00:00:00.010Z',
      clockQuality: 'estimated',
    },
    frame: { id: 'radar-1', convention: 'SENSOR_POLAR' },
    measurement: {
      modality: 'radar',
      rangeM: 100,
      bearingRad: 0.2,
      elevationRad: 0.1,
      radialVelocityMS: -2,
      signalToNoiseDb: 18,
    },
    quality: {
      detectionConfidence: 0.8,
      covariance: [4, 0, 0, 0.01],
      processingLevel: 'measurement',
      staleAfterMs: 1_000,
    },
  }
}

test('edge registry accepts a registered source and adds gateway receipt metadata', () => {
  const registry = new EdgeRegistry()
  registry.register(registration, new Date('2026-07-27T00:00:00.000Z'))
  const ack = registry.publish(
    { observations: [observation()] },
    new Date('2026-07-27T00:00:00.020Z'),
  )
  assert.equal(ack.accepted, 1)
  assert.equal(ack.rejected, 0)
  const [accepted] = registry.listObservations()
  assert.equal(accepted.gateway.ingressSequence, 1)
  assert.equal(accepted.gateway.receivedAt, '2026-07-27T00:00:00.020Z')
})

test('edge registry rejects simulator truth identifiers at ingress', () => {
  const registry = new EdgeRegistry()
  registry.register(registration)
  const unsafe = {
    ...observation(),
    simulation: { truthEntityId: 'gazebo-model-42' },
  }
  const ack = registry.publish({ observations: [unsafe] })
  assert.equal(ack.accepted, 0)
  assert.equal(ack.rejected, 1)
  assert.match(ack.errors[0].message, /truth identifiers are forbidden/)
})

test('edge registry rejects duplicate and out-of-order observations', () => {
  const registry = new EdgeRegistry()
  registry.register(registration)
  assert.equal(registry.publish({ observations: [observation(2)] }).accepted, 1)
  const duplicate = registry.publish({ observations: [observation(2)] })
  assert.equal(duplicate.rejected, 1)
  const outOfOrder = observation(1)
  outOfOrder.observationId = 'different-id'
  const ack = registry.publish({ observations: [outOfOrder] })
  assert.equal(ack.rejected, 1)
  assert.match(ack.errors[0].message, /not monotonic/)
})
