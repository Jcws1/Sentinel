import assert from 'node:assert/strict'
import test from 'node:test'
import type { Drone, ThreatTrack } from '../src/types'
import { rankAssetMatches } from '../src/utils/assetMatching'

function interceptor(
  id: string,
  overrides: Partial<Drone> = {},
): Drone {
  return {
    id,
    type: 'Interceptor',
    battery: 90,
    position: { lng: 103.819, lat: 1.352, alt: 100 },
    positioningMethod: 'GNSS',
    positioningConfidence: 95,
    comms: 'strong',
    payloadStatus: 'Ready',
    assignedTrackId: null,
    meshLinks: [],
    ...overrides,
  }
}

const track: ThreatTrack = {
  id: 'T-1',
  threatClass: 'I',
  position: { lng: 103.82, lat: 1.352, alt: 90 },
  bearing: 90,
  speed: 20,
  altitude: 90,
  etaToAsset: 45,
  fusionConfidence: 92,
  recommendedAction: 'Intercept',
  sensors: ['radar-1'],
}

test('asset matching ranks eligible responsive assets above degraded options', () => {
  const matches = rankAssetMatches(
    track,
    [
      interceptor('available'),
      interceptor('weak', { comms: 'weak', battery: 45 }),
      interceptor('busy', { assignedTrackId: 'T-OTHER' }),
    ],
    true,
  )

  assert.deepEqual(matches.map((match) => match.drone.id), [
    'available',
    'weak',
    'busy',
  ])
  assert.equal(matches[0].rank, 1)
  assert.equal(matches[0].eligible, true)
  assert.equal(matches[2].eligible, false)
  assert.match(matches[2].blockReasons.join(' '), /T-OTHER/)
})

test('ROE contributes to the score without changing asset-relative ordering', () => {
  const drones = [
    interceptor('near'),
    interceptor('far', {
      position: { lng: 103.86, lat: 1.352, alt: 100 },
    }),
  ]
  const allowed = rankAssetMatches(track, drones, true)
  const held = rankAssetMatches(track, drones, false)

  assert.deepEqual(
    allowed.map((match) => match.drone.id),
    held.map((match) => match.drone.id),
  )
  assert(allowed[0].score > held[0].score)
  assert(allowed[0].costIndex < allowed[1].costIndex)
})

