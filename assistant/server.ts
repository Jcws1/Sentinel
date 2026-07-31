import express, { type NextFunction, type Request, type Response } from 'express'
import { validateMissionDraft } from './missionDraft'
import { AssistantRequestError, type AssistantOrchestrator } from './orchestrator'

export function createAssistantApp(orchestrator: AssistantOrchestrator) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/v1/assistant/health', async (_req, res) => {
    const model = await orchestrator.model.health()
    res.status(model.ready ? 200 : 503).json({
      service: 'sentinel-assistant',
      ready: model.ready,
      model: orchestrator.model.modelId,
      detail: model.detail,
      boundaries: {
        c2ReadOnly: true,
        gazeboAccess: false,
        rawDeviceAccess: false,
        commandAccess: false,
      },
    })
  })

  app.post('/api/v1/assistant/turn', async (req, res, next) => {
    try {
      res.json(await orchestrator.handleTurn(req.body))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/v1/assistant/turn/stream', async (req, res) => {
    res.status(200)
    res.setHeader('content-type', 'application/x-ndjson; charset=utf-8')
    res.setHeader('cache-control', 'no-cache, no-transform')
    res.setHeader('x-content-type-options', 'nosniff')
    res.flushHeaders()
    try {
      await orchestrator.handleTurn(req.body, (event) => {
        res.write(`${JSON.stringify(event)}\n`)
      })
    } catch (error) {
      res.write(`${JSON.stringify({
        type: 'turn.failed',
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'assistant request failed',
      })}\n`)
    } finally {
      res.end()
    }
  })

  app.get('/api/v1/assistant/drafts/:id', (req, res) => {
    const draft = orchestrator.store.getDraft(req.params.id)
    if (!draft) {
      res.status(404).json({ error: 'mission draft not found' })
      return
    }
    res.json(draft)
  })

  app.post('/api/v1/assistant/drafts/:id/validate', (req, res) => {
    const draft = orchestrator.store.getDraft(req.params.id)
    if (!draft) {
      res.status(404).json({ error: 'mission draft not found' })
      return
    }
    res.json({
      draftId: draft.id,
      revision: draft.revision,
      deterministic: true,
      executable: false,
      ...validateMissionDraft(draft),
    })
  })

  app.get('/api/v1/assistant/conversations/:id/audit', (req, res) => {
    res.json({ entries: orchestrator.store.listAudit(req.params.id) })
  })

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status =
        error instanceof AssistantRequestError ? error.statusCode : 500
      res.status(status).json({
        error: error instanceof Error ? error.message : 'assistant request failed',
      })
    },
  )

  return app
}
