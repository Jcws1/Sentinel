import assert from 'node:assert/strict'
import test from 'node:test'
import { applyMissionDraftPatch, createMissionDraft } from '../assistant/missionDraft'
import { objectiveFromAssistantDraft } from './assistantPlanning'

test('validated assistant search draft becomes a typed recon objective', () => {
  const draft = applyMissionDraftPatch(
    createMissionDraft({ conversationId: 'conversation-1', operatorId: 'operator-1' }),
    {
      taskType: 'SEARCH',
      objective: 'Search the depot area',
      area: {
        name: 'Depot',
        center: { lat: 1.3521, lng: 103.8198, alt: 50 },
        radiusM: 500,
      },
      durationMinutes: 20,
      priority: 70,
      minimumReservePercent: 30,
      communicationsPolicy: 'CONNECTED_REQUIRED',
      authorityReference: 'Operator approval under demo policy',
      requiredCapabilities: ['EO/IR', 'Reconnaissance'],
    },
  )

  const objective = objectiveFromAssistantDraft(draft)
  assert.equal(objective.type, 'recon_area')
  assert.equal(objective.priority, 70)
  assert.equal(objective.batteryReservePercent, 30)
  assert.deepEqual(objective.requiredCapabilities, ['camera', 'recon'])
  assert.deepEqual(objective.targetPosition, draft.area?.center)
})

test('incomplete assistant draft cannot enter deterministic planning', () => {
  const draft = createMissionDraft({ conversationId: 'conversation-2', operatorId: 'operator-1' })
  assert.throws(() => objectiveFromAssistantDraft(draft), /taskType is required/)
})
