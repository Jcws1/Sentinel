import http from 'node:http'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import WebSocket, { WebSocketServer } from 'ws'
import type {
  EdgeEvent,
  EdgeSourceRegistration,
  ObservationBatch,
  SourceHealth,
} from '../contracts/edgeTypes'
import { EdgeRegistry } from './edgeRegistry'

export interface EdgeGatewayOptions {
  upstreamSimulatorUrl: string
  sensorSimulatorUrl: string
  producerToken: string
  observationLimit?: number
}

function websocketUrl(baseUrl: string, pathname: string): string {
  const url = new URL(pathname, baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

function requestBody(req: Request): string | undefined {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  return req.body === undefined ? undefined : JSON.stringify(req.body)
}

export function createEdgeGateway(options: EdgeGatewayOptions) {
  const app = express()
  const server = http.createServer(app)
  const registry = new EdgeRegistry(options.observationLimit)
  const edgeSockets = new WebSocketServer({ noServer: true })
  const simulatorSockets = new WebSocketServer({ noServer: true })

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  function requireProducer(req: Request, res: Response, next: () => void) {
    if (req.header('x-edge-token') !== options.producerToken) {
      res.status(401).json({ error: 'invalid edge producer token' })
      return
    }
    next()
  }

  app.get('/v1/edge/health', (_req, res) => {
    res.json({
      ok: true,
      protocol: 'sentinel-edge',
      version: '1.0',
      upstreamSimulatorUrl: options.upstreamSimulatorUrl,
      sensorSimulatorUrl: options.sensorSimulatorUrl,
      sources: registry.listSources().length,
      observations: registry.listObservations().length,
    })
  })

  app.get('/v1/sources', (_req, res) => {
    res.json({ sources: registry.listSources(), health: registry.listHealth() })
  })

  app.post('/v1/sources/register', requireProducer, (req, res) => {
    try {
      const source = registry.register(req.body as EdgeSourceRegistration)
      res.status(201).json(source)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'source registration failed',
      })
    }
  })

  app.post('/v1/source-health', requireProducer, (req, res) => {
    try {
      res.json(registry.publishHealth(req.body as SourceHealth))
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'health update failed',
      })
    }
  })

  app.get('/v1/observations', (req, res) => {
    const after = Number(req.query.afterIngressSequence ?? 0)
    res.json({
      observations: registry.listObservations(Number.isFinite(after) ? after : 0),
    })
  })

  app.get('/v1/recordings/current.ndjson', (req, res) => {
    const after = Number(req.query.afterIngressSequence ?? 0)
    const observations = registry.listObservations(
      Number.isFinite(after) ? after : 0,
    )
    const payload = observations
      .map((observation) => JSON.stringify(observation))
      .join('\n')
    res.setHeader(
      'content-disposition',
      'attachment; filename="sentinel-edge-recording.ndjson"',
    )
    res.type('application/x-ndjson')
    res.send(payload ? `${payload}\n` : '')
  })

  app.post('/v1/observations', requireProducer, (req, res) => {
    try {
      const ack = registry.publish(req.body as ObservationBatch)
      res.status(ack.rejected && !ack.accepted ? 422 : 202).json(ack)
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : 'publish failed',
      })
    }
  })

  async function forward(
    baseUrl: string,
    req: Request,
    res: Response,
    pathname = req.originalUrl,
  ) {
    try {
      const body = requestBody(req)
      const response = await fetch(new URL(pathname, baseUrl), {
        method: req.method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body,
        signal: AbortSignal.timeout(5_000),
      })
      const payload = await response.text()
      res.status(response.status)
      res.type(response.headers.get('content-type') ?? 'application/json')
      res.send(payload)
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : 'upstream unavailable',
      })
    }
  }

  app.use('/v1/sensor-types', (req, res) =>
    void forward(options.sensorSimulatorUrl, req, res),
  )
  app.use('/v1/sensors', (req, res) =>
    void forward(options.sensorSimulatorUrl, req, res),
  )

  app.use('/v1', (req, res) => {
    void forward(options.upstreamSimulatorUrl, req, res)
  })

  registry.onEvent((event: EdgeEvent) => {
    const payload = JSON.stringify(event)
    for (const socket of edgeSockets.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.send(payload)
    }
  })

  simulatorSockets.on('connection', (downstream) => {
    const upstream = new WebSocket(
      websocketUrl(options.upstreamSimulatorUrl, '/v1/events'),
    )
    upstream.on('message', (data) => {
      if (downstream.readyState === WebSocket.OPEN) downstream.send(data)
    })
    upstream.on('close', () => downstream.close(1013, 'simulator unavailable'))
    upstream.on('error', () => downstream.close(1013, 'simulator unavailable'))
    downstream.on('close', () => upstream.close())
  })

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://edge.local').pathname
    if (pathname === '/v1/events') {
      simulatorSockets.handleUpgrade(request, socket, head, (client) => {
        simulatorSockets.emit('connection', client, request)
      })
      return
    }
    if (pathname === '/v1/edge/events') {
      edgeSockets.handleUpgrade(request, socket, head, (client) => {
        edgeSockets.emit('connection', client, request)
      })
      return
    }
    socket.destroy()
  })

  async function close(): Promise<void> {
    for (const socket of edgeSockets.clients) socket.terminate()
    for (const socket of simulatorSockets.clients) socket.terminate()
    await new Promise<void>((resolve) => edgeSockets.close(() => resolve()))
    await new Promise<void>((resolve) => simulatorSockets.close(() => resolve()))
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  }

  return { app, server, registry, close }
}
