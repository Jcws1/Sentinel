import assert from 'node:assert/strict'
import test from 'node:test'
import { MISSION_RECORDINGS } from '../src/data/missionRecordings'
import { frameAt } from '../src/utils/missionReplay'

test('mission replay interpolates vehicle movement between keyframes', () => {
  const recording = MISSION_RECORDINGS[0]
  const start = frameAt(recording, 0)
  const middle = frameAt(recording, 10_000)
  const end = frameAt(recording, 20_000)
  const startLng = start.drones[0].position.lng
  const middleLng = middle.drones[0].position.lng
  const endLng = end.drones[0].position.lng
  assert.ok(middleLng > Math.min(startLng, endLng))
  assert.ok(middleLng < Math.max(startLng, endLng))
})

test('target disappears at the recorded lifecycle keyframe', () => {
  const recording = MISSION_RECORDINGS[0]
  const targetId = `${recording.manifest.missionId}-T1`
  assert.ok(frameAt(recording, 64_900).tracks.some((track) => track.id === targetId))
  assert.equal(frameAt(recording, 65_000).tracks.some((track) => track.id === targetId), false)
})

test('mission replay clamps seeks to the recording duration', () => {
  const recording = MISSION_RECORDINGS[0]
  const frame = frameAt(recording, recording.manifest.durationMs + 50_000)
  assert.equal(frame.atMs, recording.manifest.durationMs)
  assert.equal(frame.mission.state, 'STANDBY')
})
