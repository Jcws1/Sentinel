import assert from 'node:assert/strict'
import test from 'node:test'
import { eurocTruthFrames, parseEurocGroundTruthCsv } from './euroc'

const fixture = `#timestamp,p_x,p_y,p_z,q_w,q_x,q_y,q_z,v_x,v_y,v_z
1000000000,1,2,3,1,0,0,0,4,5,6
1005000000,2,3,4,1,0,0,0,5,6,7`

test('EuRoC parser preserves nanosecond time, ENU-like world pose, and velocity', () => {
  const samples = parseEurocGroundTruthCsv(fixture)
  assert.deepEqual(samples[0], {
    timestampNs: '1000000000',
    position: { eastM: 1, northM: 2, upM: 3 },
    velocity: { eastMS: 4, northMS: 5, upMS: 6 },
  })
  const truth = eurocTruthFrames(samples, 1)
  assert.equal(truth.length, 2)
  assert.equal(truth[0]?.provenance.sourceKind, 'MEASURED')
})
