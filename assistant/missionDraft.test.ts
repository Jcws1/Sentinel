import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyMissionDraftPatch,
  createMissionDraft,
  validateMissionDraft,
} from './missionDraft'

test('mission drafts remain non-executable and list blocking fields', () => {
  const draft = createMissionDraft({
    conversationId: 'conversation-1',
    operatorId: 'operator-1',
    now: '2026-07-31T00:00:00.000Z',
  })
  assert.equal(draft.approvalRequired, true)
  assert.equal(draft.status, 'DRAFT')
  assert.ok(draft.unresolvedFields.includes('taskType'))
  assert.equal(validateMissionDraft(draft).valid, false)
})

test('a complete sanitized patch becomes ready for deterministic validation', () => {
  const draft = createMissionDraft({
    conversationId: 'conversation-1',
    operatorId: 'operator-1',
  })
  const updated = applyMissionDraftPatch(draft, {
    taskType: 'AREA_OBSERVATION',
    objective: 'Observe the eastern route',
    area: { name: 'Eastern route', radiusM: 750 },
    durationMinutes: 60,
    priority: 60,
    communicationsPolicy: 'DEGRADED_ALLOWED',
    authorityReference: 'operator-confirmation-required',
    minimumReservePercent: 150,
    approvalRequired: false,
    status: 'SUBMITTED',
  })
  assert.equal(updated.approvalRequired, true)
  assert.equal(updated.status, 'READY_FOR_VALIDATION')
  assert.equal(updated.minimumReservePercent, 100)
  assert.equal(updated.revision, 2)
  assert.equal(validateMissionDraft(updated).valid, true)
})

