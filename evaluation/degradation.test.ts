import assert from 'node:assert/strict'
import test from 'node:test'
import { applyControlledGnssDegradation } from './degradation'
import type { PositionEstimateFrame } from './types'

function frame(seconds: number): PositionEstimateFrame {
  return {
    schemaVersion: 'sentinel-position-evaluation/1.0',
    vehicleId: 'uav-1',
    sequence: seconds,
    sourceTimestampNs: String(BigInt(seconds) * 1_000_000_000n),
    frame: { convention: 'LOCAL_ENU', frameId: 'test' },
    position: { eastM: seconds, northM: 0, upM: 0 },
    navigationSource: 'GNSS',
    fixStatus: 'VALID',
    quality: { satellitesTracked: 12 },
    provenance: {
      dataset: 'fixture',
      sequence: 'test',
      sourceRecord: String(seconds),
      sourceKind: 'MEASURED',
    },
  }
}

test('controlled outage preserves labels and restores measured provenance', () => {
  const output = applyControlledGnssDegradation([0, 35, 50, 90, 105].map(frame))
  assert.equal(output[0]?.provenance.sourceKind, 'MEASURED')
  assert.equal(output[1]?.fixStatus, 'DEGRADED')
  assert.equal(output[2]?.navigationSource, 'DEAD_RECKONING')
  assert.equal(output[2]?.quality.satellitesTracked, 0)
  assert.equal(output[3]?.fixStatus, 'DEGRADED')
  assert.equal(output[4]?.provenance.sourceKind, 'MEASURED')
})
