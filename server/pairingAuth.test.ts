import assert from 'node:assert/strict'
import test from 'node:test'
import { PairingAuth } from './pairingAuth'

test('pairing issues a bearer session and rejects an invalid code', () => {
  const auth = new PairingAuth({ required: true, code: '123456' })
  assert.throws(() => auth.pair('000000'), /Invalid pairing code/)
  const session = auth.pair('123456', 'Field phone')
  assert.equal(session.label, 'Field phone')
  assert.equal(session.token.length > 20, true)
  assert.equal(session.expiresAt > session.createdAt, true)
})
