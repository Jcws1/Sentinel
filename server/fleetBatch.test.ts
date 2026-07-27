import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBatchSpawnRequests } from './fleetBatch'

test('batch builder creates one exact vehicle ID', () => {
  const requests = buildBatchSpawnRequests({
    idPrefix: 'scout_02',
    count: 1,
    platformId: 'generic_fpv_interceptor',
    role: 'Scout',
    groupId: 'alpha',
    pose: [10, 20, 3, 0, 0, 0],
  })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].vehicleId, 'scout_02')
  assert.deepEqual(requests[0].pose, [10, 20, 3, 0, 0, 0])
})

test('batch builder creates a centred, non-overlapping staging grid', () => {
  const requests = buildBatchSpawnRequests({
    idPrefix: 'scout',
    count: 5,
    platformId: 'generic_fpv_interceptor',
    pose: [0, 0, 4, 0, 0, 0],
    spacingM: 8,
  })
  assert.deepEqual(
    requests.map((request) => request.vehicleId),
    ['scout_01', 'scout_02', 'scout_03', 'scout_04', 'scout_05'],
  )
  assert.equal(
    new Set(requests.map((request) => request.pose.slice(0, 2).join(':'))).size,
    5,
  )
  assert.ok(requests.every((request) => request.pose[2] === 4))
})

test('batch builder rejects unsafe counts and identifiers', () => {
  assert.throws(
    () =>
      buildBatchSpawnRequests({
        idPrefix: '123',
        count: 33,
        platformId: 'generic_fpv_interceptor',
        pose: [0, 0, 3, 0, 0, 0],
      }),
    /count/,
  )
})
