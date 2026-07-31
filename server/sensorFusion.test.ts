import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  AcceptedObservation,
  EdgeSensor,
  EdgeMeasurement,
} from '../contracts/edgeTypes'
import { SensorFusionEngine } from './sensorFusion'

const radar: EdgeSensor = {
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
    latencyMs: 0,
    noiseStdDevM: 2,
  },
  configurationRevision: 1,
  visualState: 'ACTIVE',
  updatedAt: '2026-07-27T00:00:00.000Z',
}

const rf: EdgeSensor = {
  ...radar,
  sensorId: 'rf-1',
  sensorTypeId: 'rf-test',
  displayName: 'RF',
  modality: 'rf',
}

const eo: EdgeSensor = {
  ...radar,
  sensorId: 'eo-1',
  sensorTypeId: 'eo-test',
  displayName: 'EO',
  modality: 'eo',
}

function accepted(
  ingressSequence: number,
  sensor: EdgeSensor,
  measurement: EdgeMeasurement,
  observedAt = `2026-07-27T00:00:0${ingressSequence}.000Z`,
): AcceptedObservation {
  return {
    schemaVersion: '1.0',
    observationId: `observation-${ingressSequence}`,
    source: {
      sourceId: 'sensor-sim',
      instanceId: 'instance-1',
      sensorId: sensor.sensorId,
      sensorTypeId: sensor.sensorTypeId,
      adapterType: 'test',
      configurationRevision: sensor.configurationRevision,
      mode: 'SIMULATED',
    },
    sequence: ingressSequence,
    time: {
      observedAt,
      sentAt: observedAt,
      clockQuality: 'estimated',
    },
    frame: { id: sensor.sensorId, convention: 'SENSOR_POLAR' },
    measurement,
    quality: {
      detectionConfidence: 0.8,
      covariance: [4, 0, 0, 0.01],
      processingLevel:
        'classification' in measurement ? 'classification' : 'measurement',
      staleAfterMs: 2_000,
    },
    gateway: {
      receivedAt: observedAt,
      ingressSequence,
    },
  }
}

function radarMeasurement(rangeM: number): EdgeMeasurement {
  return {
    modality: 'radar',
    rangeM,
    bearingRad: 0,
    elevationRad: 0,
    radialVelocityMS: 0,
    signalToNoiseDb: 18,
  }
}

test('radar measurements establish and confirm a fused sensor track', () => {
  const engine = new SensorFusionEngine()
  engine.ingest(
    [
      accepted(1, radar, radarMeasurement(100)),
      accepted(2, radar, radarMeasurement(102)),
    ],
    [radar],
    new Date('2026-07-27T00:00:02.000Z'),
  )
  const snapshot = engine.snapshot(
    'CONNECTED',
    null,
    new Date('2026-07-27T00:00:02.000Z'),
  )
  assert.equal(snapshot.tracks.length, 1)
  assert.equal(snapshot.tracks[0].lifecycle, 'CONFIRMED')
  assert(Math.abs(snapshot.tracks[0].positionEnuM.north - 101) < 2)
  assert.equal(snapshot.tracks[0].positionEnuM.east, 0)
})

test('bearing-only RF evidence associates without inventing a new position', () => {
  const engine = new SensorFusionEngine()
  engine.ingest(
    [
      accepted(1, radar, radarMeasurement(100)),
      accepted(2, rf, {
        modality: 'rf',
        bearingRad: 0.01,
        centerFrequencyHz: 2_437_000_000,
        bandwidthHz: 20_000_000,
        signalPowerDbm: -60,
      }),
    ],
    [radar, rf],
    new Date('2026-07-27T00:00:02.000Z'),
  )
  const [track] = engine.snapshot(
    'CONNECTED',
    null,
    new Date('2026-07-27T00:00:02.000Z'),
  ).tracks
  assert.deepEqual(track.modalities, ['radar', 'rf'])
  assert.equal(track.positionEnuM.east, 0)
  assert.equal(track.positionEnuM.north, 100)
})

test('bearing-only evidence cannot create a positioned track', () => {
  const engine = new SensorFusionEngine()
  engine.ingest(
    [
      accepted(1, rf, {
        modality: 'rf',
        bearingRad: 0,
        centerFrequencyHz: 2_437_000_000,
        bandwidthHz: 20_000_000,
        signalPowerDbm: -55,
      }),
    ],
    [rf],
  )
  const snapshot = engine.snapshot()
  assert.equal(snapshot.tracks.length, 0)
  assert.equal(snapshot.unassociatedBearingCount, 1)
})

test('EO classification enriches a radar track without changing its position', () => {
  const engine = new SensorFusionEngine()
  engine.ingest(
    [
      accepted(1, radar, radarMeasurement(100)),
      accepted(2, eo, {
        modality: 'eo',
        bearingRad: 0,
        elevationRad: 0,
        classification: [
          { label: 'multirotor_uas', confidence: 0.86 },
          { label: 'unknown', confidence: 0.14 },
        ],
      }),
    ],
    [radar, eo],
    new Date('2026-07-27T00:00:02.000Z'),
  )
  const [track] = engine.snapshot(
    'CONNECTED',
    null,
    new Date('2026-07-27T00:00:02.000Z'),
  ).tracks
  assert.equal(track.classifications[0].label, 'multirotor_uas')
  assert.deepEqual(track.modalities, ['radar', 'eo'])
  assert.equal(track.positionEnuM.north, 100)
})

test('stale tracks coast and are then removed', () => {
  const engine = new SensorFusionEngine()
  engine.ingest(
    [accepted(1, radar, radarMeasurement(100))],
    [radar],
    new Date('2026-07-27T00:00:01.000Z'),
  )
  assert.equal(
    engine.snapshot(
      'CONNECTED',
      null,
      new Date('2026-07-27T00:00:04.000Z'),
    ).tracks[0].lifecycle,
    'COASTING',
  )
  assert.equal(
    engine.snapshot(
      'CONNECTED',
      null,
      new Date('2026-07-27T00:00:10.000Z'),
    ).tracks.length,
    0,
  )
})
