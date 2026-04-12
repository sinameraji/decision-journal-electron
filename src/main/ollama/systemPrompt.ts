import type Database from 'better-sqlite3-multiple-ciphers'
import { listDecisions } from '../db/decisions'

const MAX_DECISIONS = 15
const MAX_BODY_CHARS = 240

const PERSONA = `You are a thoughtful decision-journal coach built into a local, offline app called Decision Journal.

Your job is to help the user reflect on the decisions they have written down: notice patterns, surface blind spots, ask clarifying questions, and offer calm, practical perspective. Be concise and direct. Do not moralize. Do not pretend to remember things outside what is given below.

The following is a snapshot of the user's most recent decisions. Everything here was written privately by the user and is only visible to this local model — it never leaves their machine.`

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function truncate(s: string, n: number): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= n) return trimmed
  return trimmed.slice(0, n - 1).trimEnd() + '…'
}

export function buildCoachSystemPrompt(db: Database.Database | null): string {
  if (!db) return PERSONA + '\n\n(No decisions available yet.)'

  const decisions = listDecisions(db).slice(0, MAX_DECISIONS)
  if (decisions.length === 0) {
    return PERSONA + '\n\n(The user has not written any decisions yet.)'
  }

  const lines = decisions.map((d, i) => {
    const date = formatDate(d.createdAt)
    const body = d.situation ? ` — ${truncate(d.situation, MAX_BODY_CHARS)}` : ''
    return `${i + 1}. [${date}] ${truncate(d.title, 200)}${body}`
  })

  return `${PERSONA}\n\nRecent decisions (newest first):\n${lines.join('\n')}`
}
