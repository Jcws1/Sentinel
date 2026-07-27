import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  SavedScenario,
  ScenarioGroup,
  ScenarioMission,
} from '../src/api/scenarioTypes'
import type { SimOrigin, SimSpawnRequest } from '../src/api/simTypes'

type ScenarioRow = {
  id: string
  name: string
  origin_json: string
  groups_json: string
  vehicles_json: string
  missions_json: string
  active: number
  created_at: string
  updated_at: string
}

export type ScenarioDraft = {
  id?: string
  name: string
  origin: SimOrigin
  groups?: ScenarioGroup[]
  vehicles?: SimSpawnRequest[]
  missions?: ScenarioMission[]
}

function configuredDataDirectory(): string {
  const configured = process.env.SENTINEL_DATA_DIR?.trim()
  return path.resolve(configured || path.join(process.cwd(), 'data'))
}

function parseRow(row: ScenarioRow): SavedScenario {
  return {
    id: row.id,
    name: row.name,
    origin: JSON.parse(row.origin_json) as SimOrigin,
    groups: JSON.parse(row.groups_json) as ScenarioGroup[],
    vehicles: JSON.parse(row.vehicles_json) as SimSpawnRequest[],
    missions: JSON.parse(row.missions_json) as ScenarioMission[],
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createScenarioDatabase() {
  const dataDirectory = configuredDataDirectory()
  mkdirSync(dataDirectory, { recursive: true })
  const databasePath = path.join(dataDirectory, 'sentinel.sqlite')
  const database = new DatabaseSync(databasePath)
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      component TEXT PRIMARY KEY,
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      origin_json TEXT NOT NULL,
      groups_json TEXT NOT NULL,
      vehicles_json TEXT NOT NULL,
      missions_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS saved_scenarios_updated_at
      ON saved_scenarios(updated_at DESC);
    INSERT INTO schema_migrations(component, version)
      VALUES ('saved_scenarios', 1)
      ON CONFLICT(component) DO UPDATE SET version = excluded.version;
  `)

  const listRows = database.prepare(`
    SELECT * FROM saved_scenarios
    ORDER BY active DESC, updated_at DESC, name ASC
  `)
  const getRow = database.prepare(
    'SELECT * FROM saved_scenarios WHERE id = ?',
  )
  const insertRow = database.prepare(`
    INSERT INTO saved_scenarios (
      id, name, origin_json, groups_json, vehicles_json, missions_json,
      active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `)
  const updateRow = database.prepare(`
    UPDATE saved_scenarios
    SET name = ?, origin_json = ?, groups_json = ?, vehicles_json = ?,
        missions_json = ?, updated_at = ?
    WHERE id = ?
  `)
  const clearActive = database.prepare('UPDATE saved_scenarios SET active = 0')
  const setActive = database.prepare(
    'UPDATE saved_scenarios SET active = 1, updated_at = ? WHERE id = ?',
  )
  const deleteRow = database.prepare(
    'DELETE FROM saved_scenarios WHERE id = ?',
  )

  function getScenario(id: string): SavedScenario | null {
    const row = getRow.get(id) as unknown as ScenarioRow | undefined
    return row ? parseRow(row) : null
  }

  return {
    databasePath,
    listScenarios(): SavedScenario[] {
      return (listRows.all() as unknown as ScenarioRow[]).map(parseRow)
    },
    getScenario,
    saveScenario(draft: ScenarioDraft): SavedScenario {
      const now = new Date().toISOString()
      const id = draft.id || randomUUID()
      const existing = getScenario(id)
      const values = [
        draft.name.trim(),
        JSON.stringify(draft.origin),
        JSON.stringify(draft.groups ?? []),
        JSON.stringify(draft.vehicles ?? []),
        JSON.stringify(draft.missions ?? []),
      ] as const
      if (!values[0]) throw new Error('Scenario name is required')
      if (existing) {
        updateRow.run(...values, now, id)
      } else {
        insertRow.run(id, ...values, now, now)
      }
      const saved = getScenario(id)
      if (!saved) throw new Error('Scenario save did not persist')
      return saved
    },
    activateScenario(id: string): SavedScenario {
      if (!getScenario(id)) throw new Error(`Scenario ${id} not found`)
      const now = new Date().toISOString()
      database.exec('BEGIN IMMEDIATE')
      try {
        clearActive.run()
        setActive.run(now, id)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw error
      }
      return getScenario(id) as SavedScenario
    },
    deleteScenario(id: string): boolean {
      return Number(deleteRow.run(id).changes) > 0
    },
    checkpoint() {
      database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    },
    close() {
      database.close()
    },
  }
}

export type ScenarioDatabase = ReturnType<typeof createScenarioDatabase>
