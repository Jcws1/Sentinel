import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSwarmMovementRequest,
  swarmVelocity,
} from '../src/utils/swarmMovement'

test('cardinal swarm movement maps to local ENU velocity', () => {
  assert.deepEqual(swarmVelocity('north', 2), { eastMS: 0, northMS: 2 })
  assert.deepEqual(swarmVelocity('west', 1.5), {
    eastMS: -1.5,
    northMS: 0,
  })
})

test('diagonal swarm movement preserves requested speed', () => {
  const value = swarmVelocity('north-east', 2)
  assert.ok(Math.abs(Math.hypot(value.eastMS, value.northMS) - 2) < 0.001)
})

test('movement request carries formation, group and spacing to Gazebo', () => {
  assert.deepEqual(
    buildSwarmMovementRequest({
      formation: 'flocking',
      direction: 'east',
      speedMS: 1,
      spacingM: 8,
      groupId: 'alpha',
    }),
    {
      mode: 'flocking',
      spacingM: 8,
      missionVelocity: { eastMS: 1, northMS: 0 },
      groupId: 'alpha',
    },
  )
})
