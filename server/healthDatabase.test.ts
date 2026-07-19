import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createHealthDatabase } from './healthDatabase'

test('CDSE poll history persists when the database is reopened', () => {
  const dataDirectory = mkdtempSync(path.join(tmpdir(), 'sentinel-health-'))
  const previousDataDirectory = process.env.SENTINEL_DATA_DIR
  process.env.SENTINEL_DATA_DIR = dataDirectory

  try {
    const first = createHealthDatabase()
    first.recordCdsePoll({
      attemptedAt: '2026-07-18T00:00:00.000Z',
      completedAt: '2026-07-18T00:00:01.250Z',
      status: 'healthy',
      durationMs: 1250,
      itemCount: 2,
      error: null,
      collection: 'cop-dem-glo-30-dged-cog',
      coverageBbox: [103.45, 1.1, 104.25, 1.65],
    })
    first.recordCdsePoll({
      attemptedAt: '2026-07-18T01:00:00.000Z',
      completedAt: '2026-07-18T01:00:00.080Z',
      status: 'error',
      durationMs: 80,
      itemCount: null,
      error: 'CDSE STAC returned HTTP 503',
      collection: 'cop-dem-glo-30-dged-cog',
      coverageBbox: [103.45, 1.1, 104.25, 1.65],
    })
    first.close()

    const reopened = createHealthDatabase()
    const history = reopened.getCdseHistory('2026-07-17T00:00:00.000Z')
    assert.equal(history.length, 2)
    assert.equal(history[0].status, 'healthy')
    assert.equal(history[0].itemCount, 2)
    assert.equal(history[1].status, 'error')
    assert.equal(history[1].error, 'CDSE STAC returned HTTP 503')
    assert.deepEqual(reopened.getLatestCdsePoll(), history[1])
    reopened.close()
  } finally {
    if (previousDataDirectory === undefined) delete process.env.SENTINEL_DATA_DIR
    else process.env.SENTINEL_DATA_DIR = previousDataDirectory
    rmSync(dataDirectory, { recursive: true, force: true })
  }
})
