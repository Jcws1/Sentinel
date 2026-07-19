import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type CdsePollResult = 'healthy' | 'error'

export interface CdsePollRecord {
  attemptedAt: string
  completedAt: string
  status: CdsePollResult
  durationMs: number
  itemCount: number | null
  error: string | null
  collection: string
  coverageBbox: [number, number, number, number]
}

export interface CdsePollHistoryPoint {
  id: number
  attemptedAt: string
  completedAt: string
  status: CdsePollResult
  durationMs: number
  itemCount: number | null
  error: string | null
}

interface CdsePollRow {
  id: number
  attempted_at: string
  completed_at: string
  status: CdsePollResult
  duration_ms: number
  item_count: number | null
  error_message: string | null
}

const DEFAULT_RETENTION_DAYS = 90

function configuredDataDirectory(): string {
  const configured = process.env.SENTINEL_DATA_DIR?.trim()
  return path.resolve(configured || path.join(process.cwd(), 'data'))
}

function configuredRetentionDays(): number {
  const value = Number(process.env.CDSE_HISTORY_RETENTION_DAYS)
  return Number.isInteger(value) && value >= 1 ? value : DEFAULT_RETENTION_DAYS
}

function toHistoryPoint(row: CdsePollRow): CdsePollHistoryPoint {
  return {
    id: row.id,
    attemptedAt: row.attempted_at,
    completedAt: row.completed_at,
    status: row.status,
    durationMs: row.duration_ms,
    itemCount: row.item_count,
    error: row.error_message,
  }
}

export function createHealthDatabase() {
  const dataDirectory = configuredDataDirectory()
  mkdirSync(dataDirectory, { recursive: true })
  const databasePath = path.join(dataDirectory, 'sentinel.sqlite')
  const retentionDays = configuredRetentionDays()
  const database = new DatabaseSync(databasePath)

  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS cdse_poll_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempted_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('healthy', 'error')),
      duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
      item_count INTEGER,
      error_message TEXT,
      collection TEXT NOT NULL,
      coverage_bbox TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cdse_poll_history_attempted_at
      ON cdse_poll_history(attempted_at);
  `)

  const insertPoll = database.prepare(`
    INSERT INTO cdse_poll_history (
      attempted_at, completed_at, status, duration_ms, item_count,
      error_message, collection, coverage_bbox
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const deleteBefore = database.prepare(
    'DELETE FROM cdse_poll_history WHERE attempted_at < ?',
  )
  const historySince = database.prepare(`
    SELECT id, attempted_at, completed_at, status, duration_ms, item_count, error_message
    FROM cdse_poll_history
    WHERE attempted_at >= ?
    ORDER BY attempted_at ASC
    LIMIT ?
  `)
  const latestPoll = database.prepare(`
    SELECT id, attempted_at, completed_at, status, duration_ms, item_count, error_message
    FROM cdse_poll_history
    ORDER BY attempted_at DESC
    LIMIT 1
  `)

  const prune = () => {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    deleteBefore.run(cutoff)
  }
  prune()

  return {
    databasePath,
    retentionDays,
    recordCdsePoll(record: CdsePollRecord) {
      insertPoll.run(
        record.attemptedAt,
        record.completedAt,
        record.status,
        record.durationMs,
        record.itemCount,
        record.error,
        record.collection,
        JSON.stringify(record.coverageBbox),
      )
      prune()
    },
    getCdseHistory(since: string, limit = 5000): CdsePollHistoryPoint[] {
      return (historySince.all(since, limit) as unknown as CdsePollRow[]).map(toHistoryPoint)
    },
    getLatestCdsePoll(): CdsePollHistoryPoint | null {
      const row = latestPoll.get() as unknown as CdsePollRow | undefined
      return row ? toHistoryPoint(row) : null
    },
    close() {
      database.close()
    },
  }
}
