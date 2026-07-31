import assert from 'node:assert/strict'
import test from 'node:test'
import {
  guardDraftPatch,
  routeConversation,
  safeModelReply,
  suggestedActions,
} from './conversationController'
import { applyMissionDraftPatch, createMissionDraft } from './missionDraft'
import type { CompactC2Context } from './types'

const context: CompactC2Context = {
  retrievedAt: '2026-07-31T00:00:00.000Z',
  source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
  mission: { id: 'm1', state: 'ACTIVE', c2Link: 'strong', gnss: 'degraded' },
  assets: [
    {
      assetId: 'uav-1',
      displayName: 'Scout One',
      platformType: 'Scout',
      batteryPercent: 82,
      position: { lat: 1, lng: 2, alt: 100 },
      positioningConfidence: 0.91,
      linkState: 'strong',
      payloadStatus: 'EO ready',
      assignedMissionId: null,
      lifecycle: 'READY',
    },
  ],
  tracks: [
    {
      trackId: 'T-04',
      threatClass: 'I',
      position: { lat: 1.36, lng: 103.83, alt: 80 },
      speed: 28,
      altitude: 80,
      etaToProtectedAssetSeconds: 42,
      fusionConfidence: 91,
      contributingSensors: ['Radar-A', 'EO-1'],
      alert: true,
    },
  ],
  policy: { summary: [], machineEvaluable: false, limitation: 'advisory' },
  limitations: [],
}

test('availability questions are answered from canonical C2 without entering drafting', () => {
  const route = routeConversation({
    message: 'Which aircraft are currently available for area observation?',
    context,
    draft: null,
  })
  assert.equal(route.intent, 'OBSERVE_AVAILABLE_ASSETS')
  assert.equal(route.stage, 'OBSERVE')
  assert.equal(route.usesModel, false)
  assert.equal(route.mayMutateDraft, false)
  assert.match(route.directReply ?? '', /Scout One/)
  assert.match(route.directReply ?? '', /canonical C2 snapshot/i)
})

test('change-history questions disclose the snapshot limitation instead of hallucinating a delta', () => {
  const route = routeConversation({ message: 'What changed in the last five minutes?', context, draft: null })
  assert.equal(route.intent, 'OBSERVE_CHANGES')
  assert.equal(route.usesModel, false)
  assert.match(route.directReply ?? '', /cannot reliably state what changed/i)
})

test('field-language inbound threat questions interrupt drafting and use canonical tracks', () => {
  const draft = createMissionDraft({ conversationId: 'c1', operatorId: 'o1' })
  for (const message of [
    'What are the enemies inbound',
    'Any hostiles approaching?',
    'What is coming at us?',
    'Show closing threats',
  ]) {
    const route = routeConversation({ message, context, draft })
    assert.equal(route.intent, 'OBSERVE_INBOUND_THREATS')
    assert.equal(route.usesModel, false)
    assert.equal(route.mayMutateDraft, false)
    assert.match(route.directReply ?? '', /T-04/)
  }
  const route = routeConversation({ message: 'What are the enemies inbound', context, draft })
  const actions = suggestedActions({ route, draft })
  assert.equal(actions[0]?.id, 'return-to-draft')
})

test('threat-location questions use canonical tracks and can never become mission areas', () => {
  const draft = createMissionDraft({ conversationId: 'c1', operatorId: 'o1' })
  for (const message of [
    'Where are the enemies',
    'Where are the hostiles?',
    'Show enemy positions',
    'Threat locations',
    'Locate threat tracks',
    'Where are the threats?',
  ]) {
    const route = routeConversation({ message, context, draft })
    assert.equal(route.intent, 'OBSERVE_THREAT_LOCATIONS')
    assert.equal(route.stage, 'OBSERVE')
    assert.equal(route.usesModel, false)
    assert.equal(route.mayMutateDraft, false)
    assert.match(route.directReply ?? '', /T-04/)
    assert.match(route.directReply ?? '', /1\.36000, 103\.83000/)
    assert.doesNotMatch(route.directReply ?? '', /mission area/i)
  }
  const route = routeConversation({ message: 'Where are the enemies', context, draft })
  const actions = suggestedActions({ route, draft })
  assert.equal(actions[0]?.id, 'return-to-draft')
  assert.equal(actions[1]?.id, 'refresh-threat-locations')
})

test('interrogative sentences are never interpreted as standalone area values', () => {
  for (const message of ['Where is the depot', 'What is nearby', 'Can you help', 'Who is there?']) {
    const route = routeConversation({ message, context, draft: null })
    assert.notEqual(route.intent, 'AMBIGUOUS_VALUE')
  }
})

test('filler and acknowledgements cannot mutate a draft', () => {
  const draft = createMissionDraft({ conversationId: 'c1', operatorId: 'o1' })
  for (const message of ['uh', 'ok sure', 'roger']) {
    const route = routeConversation({ message, context, draft })
    assert.equal(route.intent, 'ACKNOWLEDGEMENT')
    assert.equal(route.mayMutateDraft, false)
    assert.equal(route.usesModel, false)
  }
})

test('standalone place requires explicit area confirmation and offers a safe pill', () => {
  const draft = createMissionDraft({ conversationId: 'c1', operatorId: 'o1' })
  const route = routeConversation({ message: 'Canberra', context, draft })
  assert.equal(route.intent, 'AMBIGUOUS_VALUE')
  assert.equal(route.mayMutateDraft, false)
  assert.match(route.directReply ?? '', /not changed/i)
  const actions = suggestedActions({ route, draft })
  assert.equal(actions[0]?.id, 'confirm-area')
  assert.equal(actions[0]?.message, 'Use Canberra as the mission area.')
})

test('draft patch guard preserves only fields explicitly evidenced by the utterance', () => {
  const patch = guardDraftPatch('Search the Depot area for 20 minutes.', {
    taskType: 'SEARCH',
    objective: 'Search the Depot',
    area: { name: 'Depot', radiusM: 5_000, center: { lat: 1, lng: 2, alt: 0 } },
    durationMinutes: 20,
    priority: 99,
    communicationsPolicy: 'CONNECTED_REQUIRED',
    authorityReference: 'invented authority',
  })
  assert.deepEqual(patch, {
    taskType: 'SEARCH',
    objective: 'Search the Depot',
    area: { name: 'Depot' },
    durationMinutes: 20,
  })
})

test('reserved schema-token replies are replaced with safe recovery text', () => {
  assert.doesNotMatch(safeModelReply('operatorMessage'), /operatorMessage/)
})

test('ready drafts expose typed application actions rather than executable model tools', () => {
  const ready = applyMissionDraftPatch(createMissionDraft({ conversationId: 'c1', operatorId: 'o1' }), {
    taskType: 'SEARCH',
    objective: 'Search depot',
    area: { name: 'Depot' },
    durationMinutes: 20,
    priority: 70,
    communicationsPolicy: 'CONNECTED_REQUIRED',
    authorityReference: 'operator approval',
  })
  const route = routeConversation({ message: 'okay', context, draft: ready })
  const actions = suggestedActions({ route, draft: ready })
  assert.equal(actions.some((action) => action.action === 'VALIDATE_DRAFT'), true)
  assert.equal(actions.every((action) => !('command' in action)), true)
})
