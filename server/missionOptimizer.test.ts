import assert from 'node:assert/strict'
import test from 'node:test'
import type { Drone } from '../src/types'
import type { OperationalObjective } from '../src/types/missionPlanning'
import { optimizeAssignments } from './missionOptimizer'

function drone(
  id: string,
  type: Drone['type'],
  battery: number,
  lng: number,
): Drone {
  return {
    id,
    type,
    battery,
    position: { lng, lat: 1.35, alt: 50 },
    positioningMethod: 'GNSS',
    positioningConfidence: 95,
    comms: 'strong',
    payloadStatus: 'Ready',
    assignedTrackId: null,
    meshLinks: [],
  }
}

test('optimizer finds the global capability-constrained assignment', () => {
  const objectives: OperationalObjective[] = [
    {
      id: 'recon',
      name: 'Recon sector',
      type: 'recon_area',
      priority: 60,
      targetPosition: { lng: 103.81, lat: 1.35, alt: 80 },
      requiredCapabilities: ['camera'],
      minVehicles: 1,
      maxVehicles: 2,
    },
    {
      id: 'intercept',
      name: 'Intercept track',
      type: 'intercept_track',
      priority: 100,
      targetPosition: { lng: 103.83, lat: 1.35, alt: 80 },
      requiredCapabilities: ['intercept'],
      minVehicles: 1,
      maxVehicles: 2,
    },
  ]
  const plan = optimizeAssignments(
    objectives,
    [
      drone('scout-near', 'Scout', 80, 103.811),
      drone('interceptor-near', 'Interceptor', 85, 103.829),
    ],
  )
  assert.deepEqual(
    plan.assignments.map((assignment) => [
      assignment.objectiveId,
      assignment.vehicleId,
    ]),
    [
      ['recon', 'scout-near'],
      ['intercept', 'interceptor-near'],
    ],
  )
  assert.equal(plan.authority, 'OPERATOR_CONFIRM')
  assert.equal(plan.status, 'PROPOSED')
})

test('optimizer leaves unsafe vehicles unassigned and defaults to operator confirmation', () => {
  const plan = optimizeAssignments(
    [
      {
        id: 'patrol',
        name: 'Patrol',
        type: 'patrol_route',
        priority: 40,
        requiredCapabilities: [],
        minVehicles: 1,
        maxVehicles: 1,
        batteryReservePercent: 20,
      },
    ],
    [drone('low-battery', 'Scout', 12, 103.81)],
  )
  assert.deepEqual(plan.unfilledObjectiveIds, ['patrol'])
  assert.equal(plan.authority, 'OPERATOR_CONFIRM')
  assert.equal(plan.status, 'PROPOSED')
})

test('optimizer permits auto-execution only when simulation mode explicitly enables it', () => {
  const plan = optimizeAssignments(
    [
      {
        id: 'patrol',
        name: 'Patrol',
        type: 'patrol_route',
        priority: 40,
        requiredCapabilities: [],
        minVehicles: 1,
        maxVehicles: 1,
      },
    ],
    [drone('scout', 'Scout', 80, 103.81)],
    { executionMode: 'SIMULATION', allowSimulationAutoExecute: true },
  )
  assert.equal(plan.authority, 'AUTO_EXECUTE')
  assert.equal(plan.status, 'AUTO_EXECUTED')
})
