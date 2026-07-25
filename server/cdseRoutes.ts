import type { Express, Request, Response } from 'express'
import { getCdseConfig } from './cdseConfig'
import { CDSE_DEFAULT_PREFIXES, listCdsePrefix } from './cdseClient'

function badRequest(res: Response, error: string) {
  res.status(400).json({ error })
}

export function registerCdseRoutes(app: Express): void {
  app.get('/api/v1/cdse/status', (_req, res) => {
    const cfg = getCdseConfig()
    res.json({
      configured: cfg.configured,
      endpoint: cfg.endpoint,
      bucket: cfg.bucket,
      /** Never return access/secret keys */
    })
  })

  app.get('/api/v1/cdse/list', async (req: Request, res: Response) => {
    const cfg = getCdseConfig()
    if (!cfg.configured) {
      res.status(503).json({
        error: 'CDSE not configured — set CDSE_S3_ACCESS_KEY and CDSE_S3_SECRET_KEY in .env',
      })
      return
    }

    const prefixRaw = typeof req.query.prefix === 'string' ? req.query.prefix : 'Sentinel-2/'
    const prefix = prefixRaw.replace(/^\//, '')
    if (prefix.includes('..')) {
      badRequest(res, 'Invalid prefix')
      return
    }

    const maxKeys = Number(req.query.maxKeys ?? 40)
    try {
      const listing = await listCdsePrefix(prefix, Number.isFinite(maxKeys) ? maxKeys : 40)
      res.json(listing)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CDSE list failed'
      res.status(502).json({ error: message })
    }
  })

  app.get('/api/v1/cdse/catalog', async (_req, res) => {
    const cfg = getCdseConfig()
    if (!cfg.configured) {
      res.status(503).json({
        error: 'CDSE not configured — set CDSE_S3_ACCESS_KEY and CDSE_S3_SECRET_KEY in .env',
      })
      return
    }

    try {
      const roots = await Promise.all(
        CDSE_DEFAULT_PREFIXES.map(async (prefix) => {
          try {
            const listing = await listCdsePrefix(prefix, 12)
            return { prefix, ok: true as const, ...listing }
          } catch (err) {
            return {
              prefix,
              ok: false as const,
              error: err instanceof Error ? err.message : 'list failed',
            }
          }
        }),
      )
      res.json({
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
        roots,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'CDSE catalog failed'
      res.status(502).json({ error: message })
    }
  })
}
