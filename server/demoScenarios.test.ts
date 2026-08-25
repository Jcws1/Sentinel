import assert from 'node:assert/strict'
import test from 'node:test'
import { activateDemoScenario, setDemoScenarioTimelineScale } from './demoScenarios'
import { SINGAPORE_GNSS_FADE_SCENARIO_ID } from '../src/api/demoScenarioTypes'
import { advanceGnssFadeScenario, advanceSimulation } from './simulation'
import { createInitialState } from './state'

test('multi-vector demo seeds the requested forces and ingress vectors', () => {
  const state = createInitialState()
  const runtime = activateDemoScenario(state, 'singapore-multi-vector', 1_000)

  assert.equal(state.drones.length, 60)
  assert.equal(state.tracks.length, 50)
  assert.equal(state.tracks.filter((track) => track.scenario?.affiliation === 'unknown').length, 20)
  assert.equal(state.tracks.filter((track) => track.scenario?.affiliation === 'hostile').length, 30)
  assert.equal(state.tracks.filter((track) => track.scenario?.ingress === 'south').length, 20)
  assert.equal(state.tracks.filter((track) => track.scenario?.ingress === 'east').length, 30)
  assert.equal(runtime.friendlyDrones, 60)
  assert.equal(runtime.timelineScale, 2)

  const southernSwarm = state.tracks.filter((track) => track.scenario?.ingress === 'south')
  assert.ok(new Set(southernSwarm.map((track) => track.position.lat.toFixed(5))).size > 10)
  assert.ok(new Set(southernSwarm.map((track) => track.position.lng.toFixed(5))).size > 10)
  assert.ok(southernSwarm.every((track) => track.speed >= 15 && track.speed <= 28))
  assert.ok(new Set(southernSwarm.map((track) => track.speed)).size >= 10)

  const easternHostiles = state.tracks.filter((track) => track.scenario?.ingress === 'east')
  assert.ok(easternHostiles.every((track) => track.speed >= 28 && track.speed <= 34))
  assert.equal(new Set(easternHostiles.map((track) => track.speed)).size, 7)
})

test('timeline scale is adjustable only from 1x through 10x', () => {
  const state = createInitialState()
  activateDemoScenario(state, 'singapore-multi-vector', 1_000)

  assert.deepEqual(setDemoScenarioTimelineScale(state, 'singapore-multi-vector', 7), {
    timelineScale: 7,
  })
  assert.equal(state.scenario?.timelineScale, 7)
  assert.throws(() => setDemoScenarioTimelineScale(state, 'singapore-multi-vector', 11))
  setDemoScenarioTimelineScale(state, 'singapore-multi-vector', 2)
})

test('confirmed interceptor contact neutralizes both vehicles', () => {
  const state = createInitialState()
  activateDemoScenario(state, 'singapore-multi-vector', 1_000)
  const track = state.tracks.find((candidate) => candidate.scenario?.affiliation === 'hostile')!
  const drone = state.drones.find((candidate) => candidate.type === 'Interceptor')!
  track.speed = 0
  drone.position = { ...track.position }
  drone.assignedTrackId = track.id

  advanceSimulation(state, { now: 2_000 })

  assert.equal(track.scenario?.phase, 'neutralized')
  assert.equal(track.recommendedAction, 'Neutralized')
  assert.equal(drone.lifecycle, 'FAULT')
  assert.equal(drone.payloadStatus, 'Expended')
  assert.equal(drone.assignedTrackId, null)
})

test('swept-path contact catches a high-speed crossing inside the 8m envelope', () => {
  const state = createInitialState()
  activateDemoScenario(state, 'singapore-multi-vector', 1_000)
  state.scenario!.timelineScale = 10
  const track = state.tracks.find((candidate) => candidate.scenario?.affiliation === 'hostile')!
  const drone = state.drones.find((candidate) => candidate.type === 'Interceptor')!
  track.speed = 28
  track.scenario!.currentSpeed = 28
  track.bearing = 270
  drone.position = {
    lng: track.position.lng - 200 / (111_320 * Math.cos(track.position.lat * Math.PI / 180)),
    lat: track.position.lat,
    alt: track.position.alt,
  }
  drone.speed = 70
  drone.bearing = 90
  drone.assignedTrackId = track.id

  advanceSimulation(state, { now: 2_000 })

  assert.equal(track.scenario?.phase, 'neutralized')
  assert.equal(drone.lifecycle, 'FAULT')
  assert.deepEqual(drone.position, track.position)
})

test('scenario flight dynamics cap acceleration and turn rate', () => {
  const state = createInitialState()
  activateDemoScenario(state, 'singapore-multi-vector', 1_000)
  state.scenario!.timelineScale = 1
  const track = state.tracks.find((candidate) => candidate.scenario?.affiliation === 'hostile')!
  track.scenario!.phase = 'scattered'
  track.scenario!.currentSpeed = 10
  track.speed = 34
  track.bearing = 0

  advanceSimulation(state, { now: 2_000, simulateDrones: false })

  assert.ok(track.scenario!.currentSpeed <= 12.8 + Number.EPSILON)
  const headingChange = Math.abs(((track.bearing + 180) % 360) - 180)
  assert.ok(headingChange <= 30 + Number.EPSILON)
})

test('scenario tracks scatter at the border, impact, and disappear', () => {
  const state = createInitialState()
  activateDemoScenario(state, 'singapore-multi-vector', 1_000)
  const track = state.tracks[0]!
  track.position = { ...track.scenario!.entryPosition }

  advanceSimulation(state, { now: 2_000, simulateDrones: false })
  assert.equal(track.scenario?.phase, 'scattered')

  track.position = { ...track.scenario!.targetPosition }
  advanceSimulation(state, { now: 3_000, simulateDrones: false })
  assert.equal(track.scenario?.phase, 'impact')
  assert.equal(state.scenario?.impacts, 1)

  advanceSimulation(state, { now: 6_000, simulateDrones: false })
  assert.equal(state.tracks.some((candidate) => candidate.id === track.id), false)
})

test('GNSS fade scenario seeds a distributed navigation patrol', () => {
  const state = createInitialState()
  const runtime = activateDemoScenario(state, SINGAPORE_GNSS_FADE_SCENARIO_ID, 1_000)

  assert.equal(state.drones.length, 36)
  assert.equal(state.tracks.length, 0)
  assert.equal(state.mission.gnss, 'active')
  assert.equal(state.mission.fallbackPositioning, null)
  assert.equal(runtime.gnssPhase, 'BASELINE')
  assert.equal(runtime.elapsedSeconds, 0)
  assert.ok(state.drones.every((drone) => drone.navigationSource === 'GNSS'))
  assert.ok(new Set(state.drones.map((drone) => drone.scenarioAnchor?.lng.toFixed(3))).size >= 7)
})

test('GNSS fade progresses through choppy, degraded, denied and validated recovery', () => {
  const state = createInitialState()
  activateDemoScenario(state, SINGAPORE_GNSS_FADE_SCENARIO_ID, 1_000)
  const runtime = state.scenario!

  runtime.elapsedSeconds = 44
  advanceGnssFadeScenario(state, 2_000, 1)
  assert.equal(runtime.gnssPhase, 'CHOPPY')
  assert.equal(state.mission.gnss, 'degraded')
  assert.ok((runtime.affectedDrones ?? 0) > 0)
  assert.ok((runtime.satellitesTracked ?? 20) < 15)

  runtime.elapsedSeconds = 104
  advanceGnssFadeScenario(state, 3_000, 1)
  assert.equal(runtime.gnssPhase, 'DEGRADED')
  assert.equal(state.mission.gnss, 'degraded')
  assert.ok(state.drones.some((drone) => drone.navigationSource === 'SIMULATED_VIO'))

  runtime.elapsedSeconds = 179
  advanceGnssFadeScenario(state, 4_000, 1)
  assert.equal(runtime.gnssPhase, 'DENIED')
  assert.equal(state.mission.gnss, 'denied')
  assert.equal(runtime.deniedDrones, 36)
  assert.ok(state.drones.every((drone) => drone.navigationSource !== 'GNSS'))
  assert.ok(state.drones.every((drone) => (drone.positionUncertaintyM ?? 0) >= 25))

  runtime.elapsedSeconds = 320
  advanceGnssFadeScenario(state, 5_000, 1)
  assert.equal(runtime.gnssPhase, 'RECOVERING')
  assert.equal(state.mission.gnss, 'degraded')
  assert.ok((runtime.recoveringDrones ?? 0) > 0)
  assert.ok((runtime.deniedDrones ?? 36) > 0)

  runtime.elapsedSeconds = 359
  advanceGnssFadeScenario(state, 6_000, 1)
  assert.equal(runtime.gnssPhase, 'COMPLETE')
  assert.equal(runtime.active, false)
  assert.equal(state.mission.gnss, 'active')
  assert.ok(state.drones.every((drone) => drone.navigationSource === 'GNSS'))
  assert.ok(state.decisionLog.some((entry) => entry.action === 'GNSS_DENIED'))
})
