import { randomBytes, randomInt } from 'node:crypto'
import type { Express, NextFunction, Request, Response } from 'express'

type Session = {
  token: string
  label: string
  createdAt: number
  expiresAt: number
}

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000

export class PairingAuth {
  readonly required: boolean
  readonly pairingCode: string
  private sessions = new Map<string, Session>()

  constructor(options?: { required?: boolean; code?: string }) {
    this.required =
      options?.required ??
      ['1', 'true', 'yes', 'on'].includes(
        (process.env.SENTINEL_REQUIRE_PAIRING ?? '').toLowerCase(),
      )
    this.pairingCode =
      options?.code ??
      process.env.SENTINEL_PAIRING_CODE?.trim() ??
      randomInt(0, 1_000_000).toString().padStart(6, '0')
  }

  pair(code: string, label = 'Operator device'): Session {
    if (code !== this.pairingCode) throw new Error('Invalid pairing code')
    this.prune()
    const now = Date.now()
    const token = randomBytes(32).toString('base64url')
    const session = {
      token,
      label: label.slice(0, 80),
      createdAt: now,
      expiresAt: now + SESSION_DURATION_MS,
    }
    this.sessions.set(token, session)
    return session
  }

  authorize(request: Request): boolean {
    if (!this.required) return true
    const header = request.header('authorization')
    if (!header?.startsWith('Bearer ')) return false
    const token = header.slice('Bearer '.length)
    const session = this.sessions.get(token)
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessions.delete(token)
      return false
    }
    return true
  }

  requireOperator = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    if (
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS' ||
      this.authorize(request)
    ) {
      next()
      return
    }
    response.status(401).json({
      error: 'Operator pairing required',
      code: 'PAIRING_REQUIRED',
    })
  }

  private prune(): void {
    const now = Date.now()
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token)
    }
  }
}

export function registerPairingRoutes(app: Express, auth: PairingAuth): void {
  app.get('/api/v1/auth/status', (req, res) => {
    res.json({
      required: auth.required,
      authorized: auth.authorize(req),
      sessionDurationSeconds: SESSION_DURATION_MS / 1000,
    })
  })

  app.post('/api/v1/auth/pair', (req, res) => {
    try {
      const session = auth.pair(
        String(req.body?.code ?? ''),
        String(req.body?.label ?? 'Operator device'),
      )
      res.json({
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
      })
    } catch (error) {
      res.status(401).json({
        error: error instanceof Error ? error.message : 'Pairing failed',
      })
    }
  })
}
