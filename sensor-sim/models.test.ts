import assert from 'node:assert/strict'
import test from 'node:test'
import type { EdgeSensor } from '../contracts/edgeTypes'
import { simulateObservation } from './models'
import { makeTestVehicle } from './simulator'

const baseSensor: EdgeSensor = {
  sensorId: 'radar-1',
  sourceId: 'sensor-sim',
  sensorTypeId: 'radar-test',
  displayName: 'Radar',
  modality: 'radar',
  lifecycle: 'ACTIVE',
  pose: {
    frame: 'LOCAL_ENU',
    eastM: 0,
    northM: 0,
    upM: 0,
    rollRad: 0,
    pitchRad: 0,
    yawRad: 0,
  },
  configuration: {
    maxRangeM: 2_000,
    horizontalFovDeg: 360,
    verticalFovDeg: 180,
    updateRateHz: 2,
    packetLossRate: 0,
    latencyMs: 50,
    noiseStdDevM: 2,
  },
  configurationRevision: 1,
  visualState: 'ACTIVE',
  updatedAt: '2026-07-27T00:00:00.000Z',
}

test('radar model is deterministic for the same seed and inputs', () => {
  const context = {
    sourceId: 'sensor-sim',
    instanceId: 'instance-1',
    scenarioSeed: 'fixed-seed',
    sensor: baseSensor,
    vehicle: makeTestVehicle(),
    sequence: 1,
    now: new Date('2026-07-27T00:00:01.000Z'),
  }
  const first = simulateObservation(context)
  const second = simulateObservation(context)
  assert.deepEqual(first, second)
  assert.equal(first?.measurement.modality, 'radar')
  assert.equal('truthEntityId' in (first ?? {}), false)
})

test('RF model does not detect an RF-silent one-way target', () => {
  const observation = simulateObservation({
    sourceId: 'sensor-sim',
    instanceId: 'instance-1',
    scenarioSeed: 'fixed-seed',
    sensor: {
      ...baseSensor,
      modality: 'rf',
      sensorTypeId: 'rf-test',
    },
    vehicle: makeTestVehicle({
      platformId: 'silent-owa-surrogate',
      role: 'one-way',
    }),
    sequence: 1,
    now: new Date('2026-07-27T00:00:01.000Z'),
  })
  assert.equal(observation, null)
})

test('model preserves bearing-only RF geometry without inventing a position', () => {
  const observation = simulateObservation({
    sourceId: 'sensor-sim',
    instanceId: 'instance-1',
    scenarioSeed: 'fixed-seed',
    sensor: {
      ...baseSensor,
      modality: 'rf',
      sensorTypeId: 'rf-test',
    },
    vehicle: makeTestVehicle(),
    sequence: 1,
    now: new Date('2026-07-27T00:00:01.000Z'),
  })
  assert.equal(observation?.measurement.modality, 'rf')
  assert.equal('position' in (observation?.measurement ?? {}), false)
  assert.equal('rangeM' in (observation?.measurement ?? {}), false)
})

test('EO model emits deterministic bearing-only classification evidence', () => {
  const context = {
    sourceId: 'sensor-sim',
    instanceId: 'instance-1',
    scenarioSeed: 'fixed-seed',
    sensor: {
      ...baseSensor,
      modality: 'eo' as const,
      sensorTypeId: 'eo-test',
    },
    vehicle: makeTestVehicle(),
    sequence: 1,
    now: new Date('2026-07-27T00:00:01.000Z'),
  }
  const first = simulateObservation(context)
  const second = simulateObservation(context)
  assert.deepEqual(first, second)
  assert.equal(first?.measurement.modality, 'eo')
  assert.equal('rangeM' in (first?.measurement ?? {}), false)
  if (first?.measurement.modality !== 'eo') {
    assert.fail('expected EO measurement')
  }
  assert.equal(first.measurement.classification[0].label, 'multirotor_uas')
  assert.match(first.measurement.mediaRef ?? '', /^sim-media:/)
})

test('acoustic model emits bearing, frequency, and classification without range', () => {
  const observation = simulateObservation({
    sourceId: 'sensor-sim',
    instanceId: 'instance-1',
    scenarioSeed: 'fixed-seed',
    sensor: {
      ...baseSensor,
      modality: 'acoustic',
      sensorTypeId: 'acoustic-test',
    },
    vehicle: makeTestVehicle(),
    sequence: 1,
    now: new Date('2026-07-27T00:00:01.000Z'),
  })
  assert.equal(observation?.measurement.modality, 'acoustic')
  assert.equal('rangeM' in (observation?.measurement ?? {}), false)
  if (observation?.measurement.modality !== 'acoustic') {
    assert.fail('expected acoustic measurement')
  }
  assert(observation.measurement.peakFrequencyHz > 0)
  assert.equal(
    observation.measurement.classification[0].label,
    'multirotor_uas',
  )
})
