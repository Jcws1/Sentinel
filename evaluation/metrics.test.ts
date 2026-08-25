import assert from 'node:assert/strict'
import test from 'node:test'
import { alignToTruth, summarizeAccuracy } from './metrics'
import type { GroundTruthFrame, PositionEstimateFrame } from './types'

function estimate(sequence: number, timestampNs: string, eastM: number): PositionEstimateFrame {
  return {
    schemaVersion: 'sentinel-position-evaluation/1.0',
    vehicleId: 'uav-1',
    sequence,
    sourceTimestampNs: timestampNs,
    frame: { convention: 'LOCAL_ENU', frameId: 'test-enu' },
    position: { eastM, northM: 0, upM: 0 },
    navigationSource: 'GNSS',
    fixStatus: 'VALID',
    quality: { reportedUncertaintyM: 1 },
    provenance: {
      dataset: 'fixture',
      sequence: 'test',
      sourceRecord: String(sequence),
      sourceKind: 'MEASURED',
    },
  }
}

function truth(timestampNs: string, eastM: number): GroundTruthFrame {
  return {
    schemaVersion: 'sentinel-position-truth/1.0',
    vehicleId: 'uav-1',
    timestampNs,
    frameId: 'test-enu',
    position: { eastM, northM: 0, upM: 0 },
    provenance: {
      dataset: 'fixture',
      sequence: 'test',
      sourceRecord: timestampNs,
      sourceKind: 'MEASURED',
      instrument: 'fixture truth',
    },
  }
}

test('alignToTruth linearly interpolates independent truth', () => {
  const aligned = alignToTruth(
    [estimate(1, '1050000000', 5.5)],
    [truth('1000000000', 5), truth('1100000000', 6)],
  )
  assert.equal(aligned.length, 1)
  assert.equal(aligned[0]?.truth.position.eastM, 5.5)
  assert.equal(aligned[0]?.error3dM, 0)
})

test('summary reports error distribution, ordering, and uncertainty coverage', () => {
  const estimates = [
    estimate(1, '1000000000', 0.5),
    estimate(3, '1100000000', 3),
    estimate(2, '1200000000', 6),
    estimate(2, '1300000000', 8),
  ]
  const truths = [
    truth('1000000000', 0),
    truth('1100000000', 1),
    truth('1200000000', 2),
    truth('1300000000', 3),
  ]
  const summary = summarizeAccuracy(estimates, truths)
  assert.equal(summary.alignedSamples, 4)
  assert.equal(summary.duplicateSequences, 1)
  assert.equal(summary.outOfOrderEstimates, 1)
  assert.equal(summary.error3d.rmse, Math.sqrt((0.25 + 4 + 16 + 25) / 4))
  assert.equal(summary.reportedUncertaintyCoverage, 0.25)
  assert.equal(summary.overconfidentSamples, 3)
  assert.equal(summary.thresholdPassRate['5m'], 1)
})
