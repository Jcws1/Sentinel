import { useEffect, useState, type FormEvent } from 'react'
import {
  clearOperatorToken,
  operatorHeaders,
  setOperatorToken,
} from '../api/operatorAuth'

type AuthStatus = {
  required: boolean
  authorized: boolean
}

export function PairingDialog() {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void fetch('/api/v1/auth/status', { headers: operatorHeaders() })
      .then(async (response) => (await response.json()) as AuthStatus)
      .then((next) => {
        if (next.required && !next.authorized) clearOperatorToken()
        setStatus(next)
      })
      .catch(() => setStatus({ required: false, authorized: false }))
  }, [])

  if (!status?.required || status.authorized) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/v1/auth/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          label: `Sentinel ${navigator.userAgent.includes('Mobile') ? 'phone' : 'browser'}`,
        }),
      })
      const body = (await response.json()) as {
        token?: string
        error?: string
      }
      if (!response.ok || !body.token) {
        throw new Error(body.error ?? 'Pairing failed')
      }
      setOperatorToken(body.token)
      setStatus({ required: true, authorized: true })
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : 'Pairing failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pairing-overlay" role="dialog" aria-modal="true">
      <form className="pairing-card" onSubmit={submit}>
        <p className="panel__eyebrow">Secure local access</p>
        <h2>Pair operator device</h2>
        <p>Enter the six-digit code shown by Sentinel on the laptop.</p>
        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          aria-label="Pairing code"
          placeholder="000000"
        />
        {error && <p className="pairing-card__error">{error}</p>}
        <button type="submit" disabled={code.length !== 6 || submitting}>
          {submitting ? 'PAIRING…' : 'PAIR DEVICE'}
        </button>
      </form>
    </div>
  )
}
