import assert from 'node:assert/strict'
import test from 'node:test'
import type { AcceptedObservation } from '../contracts/edgeTypes'
import {
  buildReplaySchedule,
  parseRecording,
  replayRegistration,
} from './replayAdapter'

function observation(
  ingressSequence: number,
  observedAt: string,
  sensorId = 'radar-1',
): AcceptedObservation {
  return {
    schemaVersion: '1.0',
    observationId: `original-${ingressSequence}`,
    source: {
      sourceId: 'sensor-sim',
      instanceId: 'sim-instance',
      sensorId,
      sensorTypeId: 'radar-test',
      adapterType: 'sensor-sim',
      configurationRevision: 1,
      mode: 'SIMULATED',
    },
    sequence: ingressSequence,
    time: {
      observedAt,
      sentAt: new Date(Date.parse(observedAt) + 100).toISOString(),
      clockQuality: 'estimated',
    },
    frame: { id: sensorId, convention: 'SENSOR_POLAR' },
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
    gateway: {
      receivedAt: observedAt,
      ingressSequence,
    },
  }
}

test('NDJSON recording parses accepted observation envelopes', () => {
  const first = observation(1, '2026-07-27T00:00:00.000Z')
  assert.deepEqual(parseRecording(`${JSON.stringify(first)}\n`), [first])
  assert.throws(() => parseRecording('{}\nnot-json'), /line 2/)
})

test('replay schedule is deterministic, retimed, and monotonic per sensor', () => {
  const recording = [
    observation(2, '2026-07-27T00:00:02.000Z'),
    observation(1, '2026-07-27T00:00:00.000Z'),
    observation(3, '2026-07-27T00:00:03.000Z', 'radar-2'),
  ]
  const options = {
    sourceId: 'replay-1',
    instanceId: 'fixed-instance',
    anchorTime: new Date('2026-07-27T12:00:00.000Z'),
    speed: 2,
  }
  const first = buildReplaySchedule(recording, options)
  const second = buildReplaySchedule(recording, options)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map((item) => item.delayMs), [0, 1_000, 1_500])
  assert.deepEqual(first.map((item) => item.observation.sequence), [1, 2, 1])
  assert(first.every((item) => item.observation.source.mode === 'REPLAY'))
  assert(first.every((item) => !('gateway' in item.observation)))
  assert.equal(
    first[1].observation.time.observedAt,
    '2026-07-27T12:00:01.000Z',
  )
  assert.equal(first[1].observation.time.sentAt, '2026-07-27T12:00:01.050Z')
  assert.deepEqual(replayRegistration(first, options).capabilities, [
    'sensor.radar',
  ])
})

