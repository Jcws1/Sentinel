import assert from 'node:assert/strict'
import test from 'node:test'
import { ReadOnlyC2Client } from './c2Client'
import { requireLoopbackHttpUrl } from './networkBoundary'

const snapshot = {
  missionId: 'mission-1',
  mission: {
    state: 'ACTIVE',
    gnss: 'active',
    fallbackPositioning: null,
    c2Link: 'strong',
    swarmAutonomy: false,
    protectedAsset: { lat: 1.35, lng: 103.82, alt: 0 },
  },
  tracks: [
    {
      id: 'hidden-track',
      threatClass: 'I',
      position: { lat: 1.36, lng: 103.83, alt: 80 },
      bearing: 215,
      speed: 28,
      altitude: 80,
      etaToAsset: 42,
      fusionConfidence: 91,
      sensors: ['Radar-A', 'EO-1'],
      recommendedAction: 'must-not-leak-into-assistant-context',
    },
  ],
  drones: [
    {
      id: 'Scout-01',
      type: 'Scout',
      battery: 74,
      position: { lat: 1.35, lng: 103.82, alt: 100 },
      positioningMethod: 'GNSS',
      positioningConfidence: 93,
      comms: 'strong',
      payloadStatus: 'EO/IR ready',
      assignedTrackId: null,
      meshLinks: [],
      lifecycle: 'READY',
    },
  ],
  recommendations: [],
  decisionLog: [],
  policy: {
    zones: [],
    rules: [{ id: 'raw-rule', expression: 'not machine evaluable', action: 'none' }],
    summary: ['Operator confirmation required'],
    readOnly: true,
  },
  alertTrackIds: [],
}

test('C2 client reads only the canonical snapshot endpoint and compacts it', async () => {
  const calls: Array<{ url: string; method: string | undefined }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method })
    return new Response(JSON.stringify(snapshot), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  const client = new ReadOnlyC2Client('http://127.0.0.1:3001', fetchImpl)
  const context = await client.getCompactContext()

  assert.deepEqual(calls, [
    { url: 'http://127.0.0.1:3001/api/v1/snapshot', method: 'GET' },
  ])
  assert.equal(context.source, 'SENTINEL_C2_CANONICAL_SNAPSHOT')
  assert.equal(context.assets[0].assetId, 'Scout-01')
  assert.deepEqual(context.assetSummary, {
    totalReporting: 1,
    includedInModelContext: 1,
  })
  assert.deepEqual(context.trackSummary, {
    totalReporting: 1,
    includedInModelContext: 1,
  })
  assert.equal(context.tracks[0]?.trackId, 'hidden-track')
  assert.equal(context.tracks[0]?.etaToProtectedAssetSeconds, 42)
  assert.equal('recommendedAction' in (context.tracks[0] ?? {}), false)
  assert.equal(JSON.stringify(context).includes('must-not-leak'), false)
  assert.equal(JSON.stringify(context).includes('raw-rule'), false)
  assert.equal(context.policy.machineEvaluable, false)
})

test('assistant dependencies reject non-loopback URLs', () => {
  assert.throws(
    () => requireLoopbackHttpUrl('http://192.168.1.10:8080', 'model'),
    /loopback/,
  )
  assert.doesNotThrow(() =>
    requireLoopbackHttpUrl('http://127.0.0.1:8082', 'model'),
  )
})
