import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import express from 'express'
import { registerAssistantProxyRoutes } from './assistantProxy'

test('C2 assistant proxy forwards only the allow-listed loopback route', async (context) => {
  const forwarded: Array<{ url: string; method?: string; body?: string }> = []
  const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
    forwarded.push({ url: String(input), method: init?.method, body: String(init?.body ?? '') })
    return new Response(JSON.stringify({ reply: 'What area?', draft: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch

  const app = express()
  app.use(express.json())
  registerAssistantProxyRoutes(app, 'http://127.0.0.1:3002', fetchImpl)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind')

  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/assistant/turn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId: 'c1', operatorId: 'o1', message: 'Help' }),
  })
  assert.equal(response.status, 200)
  assert.equal(forwarded[0]?.url, 'http://127.0.0.1:3002/api/v1/assistant/turn')
  assert.equal(forwarded[0]?.method, 'POST')
  assert.match(forwarded[0]?.body ?? '', /conversationId/)
})

test('C2 assistant proxy rejects a non-loopback upstream', () => {
  const app = express()
  assert.throws(
    () => registerAssistantProxyRoutes(app, 'https://example.com'),
    /loopback URL/,
  )
})

test('C2 assistant proxy forwards NDJSON turn events without changing frames', async (context) => {
  const frames = [
    { type: 'turn.started', at: '2026-07-31T00:00:00.000Z' },
    { type: 'message.delta', at: '2026-07-31T00:00:01.000Z', delta: 'Ready.' },
  ]
  const fetchImpl = (async () => new Response(
    `${frames.map((frame) => JSON.stringify(frame)).join('\n')}\n`,
    { status: 200, headers: { 'content-type': 'application/x-ndjson' } },
  )) as typeof fetch
  const app = express()
  app.use(express.json())
  registerAssistantProxyRoutes(app, 'http://127.0.0.1:3002', fetchImpl)
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind')

  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/assistant/turn/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ conversationId: 'c1', operatorId: 'o1', message: 'Help' }),
  })
  assert.equal(response.headers.get('content-type')?.includes('application/x-ndjson'), true)
  const received = (await response.text()).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(received, frames)
})
