import assert from 'node:assert/strict'
import test from 'node:test'
import { LlamaCppClient, OllamaClient } from './modelClient'
import type { CompactC2Context } from './types'

test('llama.cpp client requests constrained JSON without exposing tools', async () => {
  let requestBody: Record<string, unknown> | null = null
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({ reply: 'Which area should be observed?' }),
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  const client = new LlamaCppClient(
    'qwen3-1.7b-q4',
    'http://127.0.0.1:8082',
    fetchImpl,
  )
  const context: CompactC2Context = {
    retrievedAt: '2026-07-31T00:00:00.000Z',
    source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
    mission: { id: 'm1', state: 'ACTIVE', c2Link: 'strong', gnss: 'active' },
    assets: [],
    tracks: [],
    policy: { summary: [], machineEvaluable: false, limitation: 'advisory' },
    limitations: [],
  }
  const output = await client.complete({
    message: 'Create an observation task',
    context,
    draft: null,
  })
  const captured = requestBody as unknown as Record<string, unknown>
  assert.equal(output.reply, 'Which area should be observed?')
  assert.equal(captured.max_tokens, 192)
  assert.equal(captured.temperature, 0.1)
  assert.equal('tools' in captured, false)
  const responseFormat = captured.response_format as { type?: string }
  assert.equal(responseFormat.type, 'json_schema')
})

test('Ollama client disables thinking and requests constrained JSON without tools', async () => {
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input)
    requests.push({
      url,
      ...(init?.body
        ? { body: JSON.parse(String(init.body)) as Record<string, unknown> }
        : {}),
    })
    if (url.endsWith('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({ message: { content: JSON.stringify({ reply: 'What area?' }) } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  const client = new OllamaClient('qwen3:8b', 'http://127.0.0.1:11434', fetchImpl)
  assert.equal((await client.health()).ready, true)
  const output = await client.complete({
    message: 'Create a search draft',
    context: {
      retrievedAt: '2026-07-31T00:00:00.000Z',
      source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
      mission: { id: 'm1', state: 'PLANNING', c2Link: 'strong', gnss: 'active' },
      assets: [],
      tracks: [],
      policy: { summary: [], machineEvaluable: false, limitation: 'advisory' },
      limitations: [],
    },
    draft: null,
  })
  assert.equal(output.reply, 'What area?')
  const body = requests[1]?.body ?? {}
  assert.equal(body.think, false)
  assert.equal(body.stream, false)
  assert.equal('tools' in body, false)
  assert.equal((body.format as { type?: string }).type, 'object')
})

test('Ollama client uses a compact reply-only schema for read-only turns', async () => {
  let requestBody: Record<string, unknown> = {}
  const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      `${JSON.stringify({ message: { content: '{"reply":"Mission stable."}' } })}\n`,
      { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
    )
  }) as typeof fetch
  const client = new OllamaClient('qwen3:8b', 'http://127.0.0.1:11434', fetchImpl)
  const output = await client.complete({
    message: 'Summarize the mission.',
    context: {
      retrievedAt: '2026-07-31T00:00:00.000Z',
      source: 'SENTINEL_C2_CANONICAL_SNAPSHOT',
      mission: { id: 'm1', state: 'ACTIVE', c2Link: 'strong', gnss: 'active' },
      assets: [],
      tracks: [],
      policy: { summary: [], machineEvaluable: false, limitation: 'advisory' },
      limitations: [],
    },
    draft: null,
    allowDraftPatch: false,
  })

  assert.equal(output.reply, 'Mission stable.')
  assert.equal((requestBody.options as { num_predict?: number }).num_predict, 128)
  const properties = (requestBody.format as {
    properties?: Record<string, unknown>
  }).properties ?? {}
  assert.deepEqual(Object.keys(properties), ['reply'])
})
