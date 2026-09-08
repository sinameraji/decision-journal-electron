import type Database from 'better-sqlite3-multiple-ciphers'
import { randomUUID } from 'node:crypto'
import type {
  AiProvider,
  AttachmentScope,
  ConversationMeta,
  MessageStatus,
  StoredChatMessage
} from '@shared/ai'
import { isAiProvider } from '@shared/ai'
import type { ConversationSummary } from '@shared/ipc-contract'

type DB = Database.Database

interface ConversationRow {
  id: string
  title: string
  model_id: string
  provider: string
  attachments: string
  online_consent: number
  include_memories: number
  created_at: number
  updated_at: number
}

interface ChatMessageRow {
  id: string
  role: string
  content: string
  created_at: number
  status: string
  provider: string | null
  model_id: string | null
  seq: number
}

const CONVERSATION_COLUMNS = `id, title, model_id, provider, attachments, online_consent,
                              include_memories, created_at, updated_at`

function parseAttachments(raw: string): AttachmentScope {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return { decisionIds: [] }
    return { decisionIds: parsed.filter((v): v is string => typeof v === 'string') }
  } catch {
    return { decisionIds: [] }
  }
}

function rowToMeta(row: ConversationRow): ConversationMeta {
  return {
    id: row.id,
    title: row.title,
    provider: isAiProvider(row.provider) ? row.provider : 'ollama',
    modelId: row.model_id,
    attachments: parseAttachments(row.attachments),
    onlineConsentGiven: row.online_consent === 1,
    includeMemories: row.include_memories === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseStatus(raw: string): MessageStatus {
  return raw === 'interrupted' || raw === 'error' ? raw : 'complete'
}

function rowToMessage(row: ChatMessageRow): StoredChatMessage {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    createdAt: row.created_at,
    status: parseStatus(row.status),
    provider: row.provider && isAiProvider(row.provider) ? row.provider : null,
    modelId: row.model_id
  }
}

export function createConversation(
  db: DB,
  params: {
    title: string
    provider: AiProvider
    modelId: string
    attachments: AttachmentScope
    includeMemories: boolean
  }
): ConversationMeta {
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO conversations
       (id, title, model_id, provider, attachments, online_consent, include_memories,
        created_at, updated_at)
     VALUES (@id, @title, @modelId, @provider, @attachments, 0, @includeMemories,
             @createdAt, @updatedAt)`
  ).run({
    id,
    title: params.title,
    modelId: params.modelId,
    provider: params.provider,
    attachments: JSON.stringify(params.attachments.decisionIds),
    includeMemories: params.includeMemories ? 1 : 0,
    createdAt: now,
    updatedAt: now
  })
  return {
    id,
    title: params.title,
    provider: params.provider,
    modelId: params.modelId,
    attachments: params.attachments,
    onlineConsentGiven: false,
    includeMemories: params.includeMemories,
    createdAt: now,
    updatedAt: now
  }
}

export function getConversation(db: DB, id: string): ConversationMeta | null {
  const row = db
    .prepare(`SELECT ${CONVERSATION_COLUMNS} FROM conversations WHERE id = ?`)
    .get(id) as ConversationRow | undefined
  return row ? rowToMeta(row) : null
}

export function listConversations(db: DB): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT ${CONVERSATION_COLUMNS} FROM conversations ORDER BY updated_at DESC LIMIT 50`
    )
    .all() as ConversationRow[]
  return rows.map((r) => {
    const meta = rowToMeta(r)
    return {
      id: meta.id,
      title: meta.title,
      modelId: meta.modelId,
      provider: meta.provider,
      updatedAt: meta.updatedAt
    }
  })
}

export function getConversationMessages(db: DB, conversationId: string): StoredChatMessage[] {
  const rows = db
    .prepare(
      `SELECT id, role, content, created_at, status, provider, model_id, seq
         FROM chat_messages
        WHERE conversation_id = ?
        ORDER BY seq ASC, created_at ASC`
    )
    .all(conversationId) as ChatMessageRow[]
  return rows.map(rowToMessage)
}

function nextSeq(db: DB, conversationId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM chat_messages WHERE conversation_id = ?')
    .get(conversationId) as { s: number }
  return row.s + 1
}

export function appendMessage(
  db: DB,
  conversationId: string,
  message: {
    role: 'user' | 'assistant'
    content: string
    status?: MessageStatus
    provider?: AiProvider | null
    modelId?: string | null
  }
): StoredChatMessage {
  const id = randomUUID()
  const now = Date.now()
  const seq = nextSeq(db, conversationId)
  const status = message.status ?? 'complete'
  db.prepare(
    `INSERT INTO chat_messages
       (id, conversation_id, role, content, created_at, status, provider, model_id, seq)
     VALUES (@id, @conversationId, @role, @content, @createdAt, @status, @provider, @modelId, @seq)`
  ).run({
    id,
    conversationId,
    role: message.role,
    content: message.content,
    createdAt: now,
    status,
    provider: message.provider ?? null,
    modelId: message.modelId ?? null,
    seq
  })
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId)
  return {
    id,
    role: message.role,
    content: message.content,
    createdAt: now,
    status,
    provider: message.provider ?? null,
    modelId: message.modelId ?? null
  }
}

export function setConversationAttachments(
  db: DB,
  conversationId: string,
  attachments: AttachmentScope
): void {
  db.prepare('UPDATE conversations SET attachments = ? WHERE id = ?').run(
    JSON.stringify(attachments.decisionIds),
    conversationId
  )
}

export function setConversationProvider(
  db: DB,
  conversationId: string,
  provider: AiProvider,
  modelId: string
): void {
  db.prepare('UPDATE conversations SET provider = ?, model_id = ? WHERE id = ?').run(
    provider,
    modelId,
    conversationId
  )
}

export function setConversationIncludeMemories(
  db: DB,
  conversationId: string,
  include: boolean
): void {
  db.prepare('UPDATE conversations SET include_memories = ? WHERE id = ?').run(
    include ? 1 : 0,
    conversationId
  )
}

/** Recorded the first time a thread is actually sent to an online provider. */
export function markOnlineConsent(db: DB, conversationId: string): void {
  db.prepare('UPDATE conversations SET online_consent = 1 WHERE id = ?').run(conversationId)
}

export function deleteConversation(db: DB, conversationId: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
}
