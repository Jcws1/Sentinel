import { apiRequest } from './httpClient'
import type {
  AssistantHealth,
  AssistantMissionDraft,
  AssistantRecommendationResponse,
  AssistantTurnResponse,
  AssistantTurnStreamEvent,
  AssistantValidation,
} from './assistantTypes'

export const assistantClient = {
  health() {
    return apiRequest<AssistantHealth>('/api/v1/assistant/health')
  },
  turn(input: {
    conversationId: string
    operatorId: string
    message: string
    draftId?: string
  }) {
    return apiRequest<AssistantTurnResponse>('/api/v1/assistant/turn', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  async streamTurn(
    input: {
      conversationId: string
      operatorId: string
      message: string
      draftId?: string
    },
    onEvent: (event: AssistantTurnStreamEvent) => void,
  ) {
    const response = await fetch('/api/v1/assistant/turn/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok || !response.body) {
      throw new Error(`Assistant stream failed with HTTP ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as AssistantTurnStreamEvent
        onEvent(event)
        if (event.type === 'message.delta') {
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
        }
      }
      if (done) break
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as AssistantTurnStreamEvent)
  },
  validate(draftId: string) {
    return apiRequest<AssistantValidation>(
      `/api/v1/assistant/drafts/${encodeURIComponent(draftId)}/validate`,
      { method: 'POST', body: '{}' },
    )
  },
  requestRecommendation(draft: AssistantMissionDraft) {
    return apiRequest<AssistantRecommendationResponse>(
      '/api/v1/assistant/recommendations',
      { method: 'POST', body: JSON.stringify({ draft }) },
    )
  },
}
