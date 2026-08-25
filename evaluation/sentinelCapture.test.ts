import assert from 'node:assert/strict'
import test from 'node:test'
import {
  captureThroughSentinelNormalization,
  toGatewayTelemetryEvents,
} from './sentinelCapture'
import type { PositionEstimateFrame } from './types'

test('Sentinel normalization preserves local ENU position through WGS84', () => {
  const frame: PositionEstimateFrame = {
    schemaVersion: 'sentinel-position-evaluation/1.0',
    vehicleId: 'uav-1',
    sequence: 1,
    sourceTimestampNs: '1645557150000000000',
    frame: { convention: 'LOCAL_ENU', frameId: 'test' },
    position: { eastM: 120, northM: -80, upM: 25 },
    navigationSource: 'GNSS',
    fixStatus: 'VALID',
    quality: {},
    provenance: {
      dataset: 'fixture',
      sequence: 'test',
      sourceRecord: '1',
      sourceKind: 'MEASURED',
    },
  }
  const capture = captureThroughSentinelNormalization(
    [frame],
    { latitudeDeg: 47.48, longitudeDeg: -53.01, heightM: 36 },
  )
  const output = capture.evaluationFrames[0]!
  assert.ok(Math.abs(output.position.eastM - 120) < 0.01)
  assert.ok(Math.abs(output.position.northM + 80) < 0.01)
  assert.ok(Math.abs(output.position.upM - 25) < 0.01)
  assert.equal(output.quality.reportedUncertaintyM, 1.2)
  assert.equal(capture.nativeFleetRecords[0]?.drone.positioningConfidence, 96)
  const event = toGatewayTelemetryEvents([frame])[0]!
  assert.equal(event.protocol, 'sentinel-sim')
  assert.equal(event.type, 'telemetry.frame')
  assert.equal(event.data.pose.frame, 'LOCAL_ENU')
})
