import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AssistantAuditEntry, MissionDraft } from './types'

type DraftRow = { draft_json: string }
type AuditRow = {
  id: string
  conversation_id: string
  operator_id: string
  created_at: string
  model: string
  user_message: string
  assistant_reply: string
  tools_json: string
  draft_id: string | null
  context_retrieved_at: string
}

function defaultDatabasePath(): string {
  const directory = path.resolve(
    process.env.SENTINEL_DATA_DIR?.trim() || path.join(process.cwd(), 'data'),
  )
  mkdirSync(directory, { recursive: true })
  return path.join(directory, 'sentinel-assistant.sqlite')
}

function parseAudit(row: AuditRow): AssistantAuditEntry {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    operatorId: row.operator_id,
    createdAt: row.created_at,
    model: row.model,
    userMessage: row.user_message,
    assistantReply: row.assistant_reply,
    tools: JSON.parse(row.tools_json) as string[],
    draftId: row.draft_id,
    contextRetrievedAt: row.context_retrieved_at,
  }
}

export class AssistantStore {
  private readonly database: DatabaseSync

  constructor(databasePath = defaultDatabasePath()) {
    this.database = new DatabaseSync(databasePath)
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS mission_drafts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        draft_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mission_drafts_conversation
        ON mission_drafts(conversation_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS assistant_audit (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        operator_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        model TEXT NOT NULL,
        user_message TEXT NOT NULL,
        assistant_reply TEXT NOT NULL,
        tools_json TEXT NOT NULL,
        draft_id TEXT,
        context_retrieved_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS assistant_audit_conversation
        ON assistant_audit(conversation_id, created_at ASC);
    `)
  }

  getDraft(id: string): MissionDraft | null {
    const row = this.database
      .prepare('SELECT draft_json FROM mission_drafts WHERE id = ?')
      .get(id) as DraftRow | undefined
    return row ? (JSON.parse(row.draft_json) as MissionDraft) : null
  }

  saveDraft(draft: MissionDraft): void {
    this.database
      .prepare(`
        INSERT INTO mission_drafts (
          id, conversation_id, operator_id, revision, draft_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          revision = excluded.revision,
          draft_json = excluded.draft_json,
          updated_at = excluded.updated_at
      `)
      .run(
        draft.id,
        draft.conversationId,
        draft.createdBy,
        draft.revision,
        JSON.stringify(draft),
        draft.createdAt,
        draft.updatedAt,
      )
  }

  recordAudit(entry: AssistantAuditEntry): void {
    this.database
      .prepare(`
        INSERT INTO assistant_audit (
          id, conversation_id, operator_id, created_at, model,
          user_message, assistant_reply, tools_json, draft_id,
          context_retrieved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        entry.id,
        entry.conversationId,
        entry.operatorId,
        entry.createdAt,
        entry.model,
        entry.userMessage,
        entry.assistantReply,
        JSON.stringify(entry.tools),
        entry.draftId,
        entry.contextRetrievedAt,
      )
  }

  listAudit(conversationId: string): AssistantAuditEntry[] {
    const rows = this.database
      .prepare(
        'SELECT * FROM assistant_audit WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(conversationId) as unknown as AuditRow[]
    return rows.map(parseAudit)
  }

  close(): void {
    this.database.close()
  }
}

