import type {
  AssistantModelOutput,
  CompactC2Context,
  MissionDraft,
} from './types'
import { ASSISTANT_TASK_TYPES } from './types'
import { requireLoopbackHttpUrl } from './networkBoundary'

type FetchLike = typeof fetch

export const ASSISTANT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 2_000 },
    draftPatch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskType: {
          anyOf: [
            {
              type: 'string',
              enum: [
                'AREA_OBSERVATION',
                'SEARCH',
                'RELAY',
                'ESCORT',
                'RESUPPLY',
                'MEDICAL_LOGISTICS',
              ],
            },
            { type: 'null' },
          ],
        },
        objective: { type: 'string', maxLength: 500 },
        area: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', maxLength: 160 },
                center: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['lat', 'lng'],
                  properties: {
                    lat: { type: 'number', minimum: -90, maximum: 90 },
                    lng: { type: 'number', minimum: -180, maximum: 180 },
                    alt: { type: 'number' },
                  },
                },
                radiusM: { type: 'number', minimum: 1, maximum: 1_000_000 },
              },
            },
            { type: 'null' },
          ],
        },
        earliestStart: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        latestStart: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        deadline: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        durationMinutes: {
          anyOf: [
            { type: 'number', minimum: 1, maximum: 10_080 },
            { type: 'null' },
          ],
        },
        priority: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 100 },
            { type: 'null' },
          ],
        },
        requiredCapabilities: {
          type: 'array',
          maxItems: 24,
          items: { type: 'string', maxLength: 120 },
        },
        minimumConfidence: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 1 },
            { type: 'null' },
          ],
        },
        minimumReservePercent: {
          anyOf: [
            { type: 'number', minimum: 0, maximum: 100 },
            { type: 'null' },
          ],
        },
        communicationsPolicy: {
          anyOf: [
            {
              type: 'string',
              enum: ['CONNECTED_REQUIRED', 'DEGRADED_ALLOWED'],
            },
            { type: 'null' },
          ],
        },
        authorityReference: {
          anyOf: [{ type: 'string', maxLength: 500 }, { type: 'null' }],
        },
        assumptions: {
          type: 'array',
          maxItems: 24,
          items: { type: 'string', maxLength: 120 },
        },
      },
    },
  },
} as const

// Ollama's grammar parser accepts a smaller JSON Schema subset than llama.cpp.
// Nulls and numeric bounds are still sanitized by missionDraft.ts after parsing.
const OLLAMA_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
    draftPatch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        taskType: { type: 'string', enum: [...ASSISTANT_TASK_TYPES] },
        objective: { type: 'string' },
        area: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            center: {
              type: 'object',
              additionalProperties: false,
              required: ['lat', 'lng'],
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
                alt: { type: 'number' },
              },
            },
            radiusM: { type: 'number' },
          },
        },
        earliestStart: { type: 'string' },
        latestStart: { type: 'string' },
        deadline: { type: 'string' },
        durationMinutes: { type: 'number' },
        priority: { type: 'number' },
        requiredCapabilities: { type: 'array', items: { type: 'string' } },
        minimumConfidence: { type: 'number' },
        minimumReservePercent: { type: 'number' },
        communicationsPolicy: {
          type: 'string',
          enum: ['CONNECTED_REQUIRED', 'DEGRADED_ALLOWED'],
        },
        authorityReference: { type: 'string' },
        assumptions: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const

const REPLY_ONLY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply'],
  properties: {
    reply: { type: 'string' },
  },
} as const

const SYSTEM_PROMPT = `You are Sentinel's local mission-intake copilot.

You may help an operator discover assets from the supplied canonical C2 context, identify missing mission details, ask one concise clarification question, and draft a non-executable mission request.

Hard boundaries:
- The context came from Sentinel C2 after the edge gateway. You have no direct Gazebo, sensor-simulator, MAVLink, sensor, filesystem, shell, network, policy-mutation, or command access.
- Never claim that policy or rules of engagement authorize an action. Current policy text is advisory until a deterministic policy evaluator exists.
- Never claim that a mission has been dispatched, accepted, or executed.
- Never invent asset state. State unknowns and limitations explicitly.
- Respect assetSummary, trackSummary, and context limitations. Never treat a bounded model list as the complete fleet or track set.
- Mission drafts always require operator approval.
- Only draft these task types: AREA_OBSERVATION, SEARCH, RELAY, ESCORT, RESUPPLY, MEDICAL_LOGISTICS.
- Return only the requested JSON object. Do not include hidden reasoning.
- Keep reply concise: at most 50 words and normally one short paragraph.

If the request is incomplete, preserve known fields in draftPatch and ask the single highest-value blocking question in reply.`

export interface AssistantLanguageModel {
  readonly modelId: string
  health(): Promise<{ ready: boolean; detail: string }>
  complete(input: {
    message: string
    context: CompactC2Context
    draft: MissionDraft | null
    allowDraftPatch?: boolean
    onProgress?: (chunks: number) => void
  }): Promise<AssistantModelOutput>
}

function extractMessageContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === 'object' && 'text' in item
          ? String((item as { text: unknown }).text)
          : '',
      )
      .join('')
  }
  throw new Error('Local model returned no message content')
}

function parseOutput(value: unknown): AssistantModelOutput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Local model output was not a JSON object')
  }
  const candidate = value as Record<string, unknown>
  if (typeof candidate.reply !== 'string' || !candidate.reply.trim()) {
    throw new Error('Local model output did not include a reply')
  }
  return {
    reply: candidate.reply.trim().slice(0, 2_000),
    ...(candidate.draftPatch && typeof candidate.draftPatch === 'object'
      ? { draftPatch: candidate.draftPatch }
      : {}),
  }
}

export class LlamaCppClient implements AssistantLanguageModel {
  readonly baseUrl: URL
  readonly modelId: string
  private readonly fetchImpl: FetchLike

  constructor(
    modelId: string,
    baseUrl = 'http://127.0.0.1:8082',
    fetchImpl: FetchLike = fetch,
  ) {
    this.modelId = modelId
    this.baseUrl = requireLoopbackHttpUrl(baseUrl, 'Local model base URL')
    this.fetchImpl = fetchImpl
  }

  async health(): Promise<{ ready: boolean; detail: string }> {
    try {
      const response = await this.fetchImpl(new URL('/health', this.baseUrl), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(1_000),
      })
      return {
        ready: response.ok,
        detail: response.ok ? 'local model ready' : `HTTP ${response.status}`,
      }
    } catch (error) {
      return {
        ready: false,
        detail: error instanceof Error ? error.message : 'local model unavailable',
      }
    }
  }

  async complete(input: {
    message: string
    context: CompactC2Context
    draft: MissionDraft | null
    allowDraftPatch?: boolean
    onProgress?: (chunks: number) => void
  }): Promise<AssistantModelOutput> {
    const allowDraftPatch = input.allowDraftPatch !== false
    const response = await this.fetchImpl(
      new URL('/v1/chat/completions', this.baseUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: this.modelId,
          temperature: 0.1,
          max_tokens: allowDraftPatch ? 192 : 128,
          stream: false,
          response_format: {
            type: 'json_schema',
            schema: allowDraftPatch
              ? ASSISTANT_OUTPUT_SCHEMA
              : REPLY_ONLY_OUTPUT_SCHEMA,
          },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                operatorMessage: input.message,
                canonicalC2Context: input.context,
                currentDraft: input.draft,
              }),
            },
          ],
        }),
      },
    )
    if (!response.ok) {
      throw new Error(`Local model request failed with HTTP ${response.status}`)
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>
    }
    const content = extractMessageContent(body.choices?.[0]?.message?.content)
    input.onProgress?.(1)
    return parseOutput(JSON.parse(content) as unknown)
  }
}

export class OllamaClient implements AssistantLanguageModel {
  readonly baseUrl: URL
  readonly modelId: string
  private readonly fetchImpl: FetchLike

  constructor(
    modelId: string,
    baseUrl = 'http://127.0.0.1:11434',
    fetchImpl: FetchLike = fetch,
  ) {
    this.modelId = modelId
    this.baseUrl = requireLoopbackHttpUrl(baseUrl, 'Ollama base URL')
    this.fetchImpl = fetchImpl
  }

  async health(): Promise<{ ready: boolean; detail: string }> {
    try {
      const response = await this.fetchImpl(new URL('/api/tags', this.baseUrl), {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2_000),
      })
      if (!response.ok) return { ready: false, detail: `HTTP ${response.status}` }
      const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> }
      const present = body.models?.some(
        (model) => model.name === this.modelId || model.model === this.modelId,
      )
      return present
        ? { ready: true, detail: 'local Ollama model ready' }
        : { ready: false, detail: `Ollama model is not installed: ${this.modelId}` }
    } catch (error) {
      return {
        ready: false,
        detail: error instanceof Error ? error.message : 'Ollama unavailable',
      }
    }
  }

  async complete(input: {
    message: string
    context: CompactC2Context
    draft: MissionDraft | null
    allowDraftPatch?: boolean
    onProgress?: (chunks: number) => void
  }): Promise<AssistantModelOutput> {
    const allowDraftPatch = input.allowDraftPatch !== false
    const response = await this.fetchImpl(new URL('/api/chat', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: this.modelId,
        stream: false,
        think: false,
        format: allowDraftPatch
          ? OLLAMA_OUTPUT_SCHEMA
          : REPLY_ONLY_OUTPUT_SCHEMA,
        keep_alive: '10m',
        options: {
          temperature: 0.1,
          num_ctx: 4_096,
          num_predict: allowDraftPatch ? 192 : 128,
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              operatorMessage: input.message,
              canonicalC2Context: input.context,
              currentDraft: input.draft,
            }),
          },
        ],
      }),
    })
    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 500)
      throw new Error(
        `Ollama request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      )
    }
    const frame = (await response.json()) as {
      message?: { content?: unknown }
      error?: string
    }
    if (frame.error) throw new Error(frame.error)
    const content = extractMessageContent(frame.message?.content)
    input.onProgress?.(1)
    return parseOutput(JSON.parse(content) as unknown)
  }
}

export function createLocalModelClient(options: {
  provider?: string
  modelId?: string
  baseUrl?: string
}) {
  const provider = options.provider?.trim().toLowerCase() || 'llama.cpp'
  if (provider === 'ollama') {
    return new OllamaClient(
      options.modelId?.trim() || 'qwen3:1.7b',
      options.baseUrl?.trim() || 'http://127.0.0.1:11434',
    )
  }
  if (provider !== 'llama.cpp' && provider !== 'llamacpp') {
    throw new Error(`Unsupported SENTINEL_LLM_PROVIDER: ${provider}`)
  }
  return new LlamaCppClient(
    options.modelId?.trim() || 'qwen3-1.7b-q4',
    options.baseUrl?.trim() || 'http://127.0.0.1:8082',
  )
}
