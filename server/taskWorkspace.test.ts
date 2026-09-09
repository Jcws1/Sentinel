import assert from 'node:assert/strict'
import test from 'node:test'
import { missionPlanSummary, taskReference, taskWorkspaceCustody } from '../src/utils/taskWorkspace'
import taskingReducer, {
  hydrateTasking,
  setActiveRecommendation,
} from '../src/store/taskingSlice'
import type { Drone, TaskingRecommendation } from '../src/types'

function recommendation(
  id: string,
  status: TaskingRecommendation['status'],
): TaskingRecommendation {
  return {
    id,
    trackId: `track-${id}`,
    droneIds: ['drone-1'],
    route: { waypoints: [] },
    etaSeconds: 10,
    confidence: 90,
    status,
    summary: id,
    autoExecuteAt: null,
  }
}

test('pending recommendations remain proposed and explicitly unsent', () => {
  assert.deepEqual(taskWorkspaceCustody({ status: 'pending' }), {
    phase: 'proposed',
    label: 'Proposed',
    detail: 'Not sent',
    activeStep: 0,
  })
})

test('confirmed recommendations stop before aircraft acknowledgement', () => {
  assert.deepEqual(taskWorkspaceCustody({ status: 'confirmed' }), {
    phase: 'executing',
    label: 'Confirmed',
    detail: 'Aircraft acknowledgement unavailable',
    activeStep: 2,
  })
})

test('rejected recommendations never imply command dispatch', () => {
  assert.deepEqual(taskWorkspaceCustody({ status: 'vetoed' }), {
    phase: 'closed',
    label: 'Rejected',
    detail: 'No command sent',
    activeStep: -1,
  })
})

test('task references are stable and remove unsafe punctuation', () => {
  assert.equal(taskReference('rec-demo/track:042'), 'TASK-CK042')
  assert.equal(taskReference('---'), 'TASK-NEW')
})

test('hydration preserves the selected task when it transitions to confirmed', () => {
  let state = taskingReducer(undefined, { type: 'init' })
  state = taskingReducer(state, setActiveRecommendation('task-a'))
  state = taskingReducer(
    state,
    hydrateTasking({
      recommendations: [
        recommendation('task-a', 'confirmed'),
        recommendation('task-b', 'pending'),
      ],
      decisionLog: [],
    }),
  )

  assert.equal(state.activeRecommendationId, 'task-a')
})

test('mission plan summary counts unique assignments and usable reserves', () => {
  const first = recommendation('task-a', 'pending')
  first.droneIds = ['drone-1', 'drone-2']
  const second = recommendation('task-b', 'confirmed')
  second.droneIds = ['drone-2']
  const baseDrone: Drone = {
    id: 'drone-1',
    type: 'Interceptor',
    battery: 80,
    position: { lng: 0, lat: 0, alt: 0 },
    positioningMethod: 'GNSS',
    positioningConfidence: 100,
    comms: 'strong',
    payloadStatus: 'ready',
    assignedTrackId: null,
    meshLinks: [],
  }

  assert.deepEqual(
    missionPlanSummary(
      [first, second],
      [
        baseDrone,
        { ...baseDrone, id: 'drone-2' },
        { ...baseDrone, id: 'drone-3' },
        { ...baseDrone, id: 'drone-4', battery: 10 },
      ],
    ),
    {
      groupCount: 2,
      assignedAssetCount: 2,
      reserveCount: 1,
      reviewCount: 1,
      executingCount: 1,
    },
  )
})
