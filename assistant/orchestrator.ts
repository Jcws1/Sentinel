import { randomUUID } from 'node:crypto'
import { applyMissionDraftPatch, createMissionDraft } from './missionDraft'
import {
  guardDraftPatch,
  routeConversation,
  safeModelReply,
  suggestedActions,
} from './conversationController'
import type { ReadOnlyC2Client } from './c2Client'
import type { AssistantLanguageModel } from './modelClient'
import type { AssistantStore } from './store'
import type {
  AssistantTurnRequest,
  AssistantTurnResponse,
  AssistantTurnStreamEvent,
  AssistantModelOutput,
  MissionDraft,
} from './types'

type StreamEventWithoutAt = AssistantTurnStreamEvent extends infer Event
  ? Event extends { at: string }
    ? Omit<Event, 'at'>
    : never
  : never

export class AssistantRequestError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.statusCode = statusCode
  }
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AssistantRequestError(`${field} is required`)
  }
  if (value.trim().length > maximum) {
    throw new AssistantRequestError(`${field} exceeds ${maximum} characters`)
  }
  return value.trim()
}

export class AssistantOrchestrator {
  readonly c2: ReadOnlyC2Client
  readonly model: AssistantLanguageModel
  readonly store: AssistantStore

  constructor(
    c2: ReadOnlyC2Client,
    model: AssistantLanguageModel,
    store: AssistantStore,
  ) {
    this.c2 = c2
    this.model = model
    this.store = store
  }

  async handleTurn(
    value: AssistantTurnRequest,
    emit?: (event: AssistantTurnStreamEvent) => void,
  ): Promise<AssistantTurnResponse> {
    const send = (event: StreamEventWithoutAt) =>
      emit?.({ ...event, at: new Date().toISOString() } as AssistantTurnStreamEvent)
    send({ type: 'turn.started' })
    const conversationId = requiredText(
      value.conversationId,
      'conversationId',
      128,
    )
    const operatorId = requiredText(value.operatorId, 'operatorId', 128)
    const message = requiredText(value.message, 'message', 4_000)

    let draft: MissionDraft | null = null
    if (value.draftId) {
      draft = this.store.getDraft(value.draftId)
      if (!draft) throw new AssistantRequestError('mission draft not found', 404)
      if (
        draft.conversationId !== conversationId ||
        draft.createdBy !== operatorId
      ) {
        throw new AssistantRequestError('mission draft does not belong to this session', 403)
      }
    }

    send({ type: 'context.requested' })
    const context = await this.c2.getCompactContext()
    send({
      type: 'context.received',
      retrievedAt: context.retrievedAt,
      assetCount: context.assets.length,
      trackCount: context.tracks.length,
    })
    const route = routeConversation({ message, context, draft })
    send({ type: 'intent.classified', intent: route.intent, stage: route.stage })

    let output: AssistantModelOutput | null = route.directReply ? { reply: route.directReply } : null
    if (route.usesModel) {
      try {
        send({ type: 'model.started', model: this.model.modelId })
        output = await this.model.complete({
          message,
          context,
          draft,
          allowDraftPatch: route.mayMutateDraft,
          onProgress: (chunks) => {
            if (chunks === 1 || chunks % 8 === 0) send({ type: 'model.progress', chunks })
          },
        })
        send({ type: 'model.completed' })
      } catch (error) {
        throw new AssistantRequestError(
          error instanceof Error ? error.message : 'local model unavailable',
          503,
        )
      }
    }
    if (!output) throw new AssistantRequestError('assistant route produced no response', 500)

    const tools = ['get_c2_canonical_snapshot']
    const guardedPatch = route.mayMutateDraft && output.draftPatch
      ? guardDraftPatch(message, output.draftPatch)
      : null
    if (guardedPatch && Object.keys(guardedPatch).length > 0) {
      const base =
        draft || createMissionDraft({ conversationId, operatorId })
      draft = applyMissionDraftPatch(base, guardedPatch)
      this.store.saveDraft(draft)
      tools.push('save_mission_draft')
      send({ type: 'draft.updated', draft })
    }

    const modelReply = safeModelReply(output.reply)
    const reply =
      route.mayMutateDraft && draft?.status === 'READY_FOR_VALIDATION' && /\?\s*$/.test(modelReply)
        ? 'All required mission fields are present. The draft is ready for deterministic validation.'
        : modelReply

    this.store.recordAudit({
      id: randomUUID(),
      conversationId,
      operatorId,
      createdAt: new Date().toISOString(),
      model: this.model.modelId,
      userMessage: message,
      assistantReply: reply,
      tools,
      draftId: draft?.id ?? null,
      contextRetrievedAt: context.retrievedAt,
    })

    const stage = draft?.status === 'READY_FOR_VALIDATION' ? 'DECIDE' : route.stage
    const response = {
      reply,
      draft,
      contextRetrievedAt: context.retrievedAt,
      model: this.model.modelId,
      stage,
      intent: route.intent,
      suggestedActions: suggestedActions({ route: { ...route, stage }, draft }),
    }
    for (const delta of reply.match(/.{1,18}(?:\s+|$)/g) ?? [reply]) {
      send({ type: 'message.delta', delta })
    }
    send({ type: 'turn.completed', response })
    return response
  }
}
