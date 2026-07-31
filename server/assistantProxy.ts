import type { Express, Request, Response } from 'express'
import { requireLoopbackHttpUrl } from '../assistant/networkBoundary'

type FetchLike = typeof fetch

async function forward(
  baseUrl: URL,
  fetchImpl: FetchLike,
  req: Request,
  res: Response,
  upstreamPath: string,
  timeoutMs: number,
) {
  try {
    const response = await fetchImpl(new URL(upstreamPath, baseUrl), {
      method: req.method,
      headers: {
        accept: 'application/json',
        ...(req.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body ?? {}) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await response.text()
    res.status(response.status)
    res.type(response.headers.get('content-type') ?? 'application/json')
    res.send(body)
  } catch (error) {
    res.status(503).json({
      error: 'Local AI assistant unavailable',
      detail: error instanceof Error ? error.message : 'upstream unavailable',
    })
  }
}

async function forwardStream(
  baseUrl: URL,
  fetchImpl: FetchLike,
  req: Request,
  res: Response,
) {
  try {
    const response = await fetchImpl(new URL('/api/v1/assistant/turn/stream', baseUrl), {
      method: 'POST',
      headers: { accept: 'application/x-ndjson', 'content-type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(70_000),
    })
    res.status(response.status)
    res.type(response.headers.get('content-type') ?? 'application/x-ndjson')
    res.setHeader('cache-control', 'no-cache, no-transform')
    if (!response.body) {
      res.end()
      return
    }
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch (error) {
    if (!res.headersSent) res.status(503).type('application/x-ndjson')
    res.end(`${JSON.stringify({
      type: 'turn.failed',
      at: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Local AI assistant unavailable',
    })}\n`)
  }
}

export function registerAssistantProxyRoutes(
  app: Express,
  baseUrlValue = process.env.SENTINEL_ASSISTANT_BASE_URL?.trim() || 'http://127.0.0.1:3002',
  fetchImpl: FetchLike = fetch,
) {
  const baseUrl = requireLoopbackHttpUrl(baseUrlValue, 'Assistant base URL')

  app.get('/api/v1/assistant/health', (req, res) =>
    forward(baseUrl, fetchImpl, req, res, '/api/v1/assistant/health', 3_000),
  )
  app.post('/api/v1/assistant/turn', (req, res) =>
    forward(baseUrl, fetchImpl, req, res, '/api/v1/assistant/turn', 70_000),
  )
  app.post('/api/v1/assistant/turn/stream', (req, res) =>
    void forwardStream(baseUrl, fetchImpl, req, res),
  )
  app.get('/api/v1/assistant/drafts/:id', (req, res) =>
    forward(
      baseUrl,
      fetchImpl,
      req,
      res,
      `/api/v1/assistant/drafts/${encodeURIComponent(req.params.id)}`,
      3_000,
    ),
  )
  app.post('/api/v1/assistant/drafts/:id/validate', (req, res) =>
    forward(
      baseUrl,
      fetchImpl,
      req,
      res,
      `/api/v1/assistant/drafts/${encodeURIComponent(req.params.id)}/validate`,
      5_000,
    ),
  )
  app.get('/api/v1/assistant/conversations/:id/audit', (req, res) =>
    forward(
      baseUrl,
      fetchImpl,
      req,
      res,
      `/api/v1/assistant/conversations/${encodeURIComponent(req.params.id)}/audit`,
      5_000,
    ),
  )
}
