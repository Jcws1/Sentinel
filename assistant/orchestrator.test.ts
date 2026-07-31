import assert from 'node:assert/strict'
import test from 'node:test'
import type { ReadOnlyC2Client } from './c2Client'
import type { AssistantLanguageModel } from './modelClient'
import { AssistantOrchestrator } from './orchestrator'
import { AssistantStore } from './store'
import { createMissionDraft } from './missionDraft'
import type { CompactC2Context } from './types'

const context: CompactC2Context = {
  retrievedAt: '2026-07-31T00:00:00.000Z',
  source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
  mission: { id: 'mission-1', state: 'ACTIVE', c2Link: 'strong', gnss: 'active' },
  assets: [],
  tracks: [],
  policy: {
    summary: ['Operator confirmation required'],
    machineEvaluable: false,
    limitation: 'advisory only',
  },
  limitations: ['No direct device access'],
}

test('orchestrator saves only a non-executable draft and audit record', async (t) => {
  let contextReads = 0
  const c2 = {
    getCompactContext: async () => {
      contextReads += 1
      return context
    },
  } as ReadOnlyC2Client
  const model: AssistantLanguageModel = {
    modelId: 'test-local-model',
    health: async () => ({ ready: true, detail: 'ready' }),
    complete: async (input) => {
      input.onProgress?.(1)
      return {
        reply: 'What duration is required?',
        draftPatch: {
          taskType: 'AREA_OBSERVATION',
          objective: 'Observe the eastern route',
          area: { name: 'Eastern route' },
        },
      }
    },
  }
  const store = new AssistantStore(':memory:')
  t.after(() => store.close())
  const orchestrator = new AssistantOrchestrator(c2, model, store)

  const events: string[] = []
  const response = await orchestrator.handleTurn({
    conversationId: 'conversation-1',
    operatorId: 'operator-1',
    message: 'Find something to observe the eastern route',
  }, (event) => events.push(event.type))

  assert.equal(contextReads, 1)
  assert.equal(response.draft?.approvalRequired, true)
  assert.equal(response.draft?.status, 'DRAFT')
  assert.ok(response.draft?.unresolvedFields.includes('durationMinutesOrDeadline'))
  const audit = store.listAudit('conversation-1')
  assert.equal(audit.length, 1)
  assert.deepEqual(audit[0].tools, [
    'get_c2_canonical_snapshot',
    'save_mission_draft',
  ])
  assert.equal(audit[0].tools.some((tool) => /gazebo|command|engage/i.test(tool)), false)
  assert.deepEqual(events.slice(0, 7), [
    'turn.started',
    'context.requested',
    'context.received',
    'intent.classified',
    'model.started',
    'model.progress',
    'model.completed',
  ])
  assert.ok(events.includes('draft.updated'))
  assert.ok(events.includes('message.delta'))
  assert.equal(events.at(-1), 'turn.completed')
})

test('orchestrator suppresses a contradictory question after the draft becomes complete', async (t) => {
  const c2 = { getCompactContext: async () => context } as ReadOnlyC2Client
  const model: AssistantLanguageModel = {
    modelId: 'test-local-model',
    health: async () => ({ ready: true, detail: 'ready' }),
    complete: async () => ({
      reply: 'What is the objective?',
      draftPatch: {
        taskType: 'SEARCH',
        objective: 'Search the depot',
        area: { name: 'Depot' },
        durationMinutes: 20,
        priority: 70,
        communicationsPolicy: 'CONNECTED_REQUIRED',
        authorityReference: 'operator approval',
      },
    }),
  }
  const store = new AssistantStore(':memory:')
  t.after(() => store.close())
  const orchestrator = new AssistantOrchestrator(c2, model, store)

  const response = await orchestrator.handleTurn({
    conversationId: 'conversation-complete',
    operatorId: 'operator-1',
    message: 'Create a high priority search mission for the Depot area for 20 minutes, with connected communications required and operator approval authority.',
  })

  assert.equal(response.draft?.status, 'READY_FOR_VALIDATION')
  assert.equal(
    response.reply,
    'All required mission fields are present. The draft is ready for deterministic validation.',
  )
  assert.equal(store.listAudit('conversation-complete')[0]?.assistantReply, response.reply)
})

test('failure transcript stays in guarded OOD routes without corrupting the draft', async (t) => {
  let modelCalls = 0
  const guardedContext: CompactC2Context = {
    ...context,
    assets: [{
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
    }],
    tracks: [{
      trackId: 'T-04',
      threatClass: 'I',
      position: { lat: 1.36, lng: 103.83, alt: 80 },
      speed: 28,
      altitude: 80,
      etaToProtectedAssetSeconds: 42,
      fusionConfidence: 91,
      contributingSensors: ['Radar-A', 'EO-1'],
      alert: true,
    }],
  }
  const c2 = { getCompactContext: async () => guardedContext } as ReadOnlyC2Client
  const model: AssistantLanguageModel = {
    modelId: 'test-local-model',
    health: async () => ({ ready: true, detail: 'ready' }),
    complete: async () => {
      modelCalls += 1
      return { reply: 'operatorMessage', draftPatch: { authorityReference: 'invented' } }
    },
  }
  const store = new AssistantStore(':memory:')
  t.after(() => store.close())
  const orchestrator = new AssistantOrchestrator(c2, model, store)

  const availability = await orchestrator.handleTurn({
    conversationId: 'guarded-conversation',
    operatorId: 'operator-1',
    message: 'Which aircraft are currently available for area observation?',
  })
  assert.equal(availability.intent, 'OBSERVE_AVAILABLE_ASSETS')
  assert.equal(availability.stage, 'OBSERVE')
  assert.match(availability.reply, /Scout One/)
  assert.equal(availability.draft, null)
  assert.equal(modelCalls, 0)

  const existing = createMissionDraft({ conversationId: 'guarded-conversation', operatorId: 'operator-1' })
  store.saveDraft(existing)
  for (const message of ['Canberra', 'uh', 'ok sure', 'is this a fallback?', 'What are the enemies inbound', 'Where are the enemies']) {
    const response = await orchestrator.handleTurn({
      conversationId: 'guarded-conversation',
      operatorId: 'operator-1',
      message,
      draftId: existing.id,
    })
    assert.equal(response.draft?.revision, existing.revision)
    if (message === 'What are the enemies inbound') {
      assert.equal(response.intent, 'OBSERVE_INBOUND_THREATS')
      assert.match(response.reply, /T-04/)
      assert.equal(response.suggestedActions[0]?.id, 'return-to-draft')
    }
    if (message === 'Where are the enemies') {
      assert.equal(response.intent, 'OBSERVE_THREAT_LOCATIONS')
      assert.match(response.reply, /T-04/)
      assert.match(response.reply, /1\.36000, 103\.83000/)
      assert.equal(response.suggestedActions[0]?.id, 'return-to-draft')
    }
  }
  assert.equal(modelCalls, 0)

  const malformed = await orchestrator.handleTurn({
    conversationId: 'guarded-conversation',
    operatorId: 'operator-1',
    message: 'Why did that happen?',
    draftId: existing.id,
  })
  assert.equal(modelCalls, 1)
  assert.doesNotMatch(malformed.reply, /operatorMessage/)
  assert.equal(malformed.draft?.revision, existing.revision)
})
