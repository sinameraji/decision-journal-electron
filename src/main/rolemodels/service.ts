/**
 * Role-model lookup and profile building.
 *
 * Two bounded steps, never a loop that can run away: identify, then profile.
 * Identification is capped at MAX_DISAMBIGUATION_ROUNDS; when it runs out the
 * app asks the user for a distinguishing detail instead of guessing again.
 *
 * Requests here send a public figure's name and nothing from the journal. That
 * matters, because web search hands the query to a third-party search provider
 * — which is why no journal-bearing request may ever enable it.
 */

import type Database from 'better-sqlite3-multiple-ciphers'
import { BrowserWindow } from 'electron'
import type { RoleModelCandidate, RoleModelResult } from '@shared/roleModels'
import { MAX_DISAMBIGUATION_ROUNDS } from '@shared/roleModels'
import { getCachedCatalog } from '../ai/catalog'
import { readOpenRouterKey } from '../ai/credentials'
import { loadOnlineSettings } from '../ai/settings'
import { OpenRouterError, streamChatCompletion } from '../ai/openrouterClient'
import {
  FRAMEWORKS_INSTRUCTION,
  FRAMEWORKS_RESPONSE_FORMAT,
  IDENTIFY_INSTRUCTION,
  IDENTIFY_RESPONSE_FORMAT,
  PROFILE_INSTRUCTION,
  PROFILE_RESPONSE_FORMAT
} from './prompt'
import * as store from './store'
import { validateCandidates, validateProfile } from './validate'

export interface RoleModelHost {
  db(): Database.Database | null
  vaultGeneration(): number
  defaultModel(): Promise<string>
}

let host: RoleModelHost | null = null

export function configureRoleModels(next: RoleModelHost): void {
  host = next
}

const IDENTIFY_SEARCH_RESULTS = 4
const PROFILE_SEARCH_RESULTS = 8

function notify(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('rolemodels:changed')
  }
}

const inFlight = new Set<string>()

/** Shared preflight: online on, key present, ZDR-capable model. */
async function ready(
  db: Database.Database
): Promise<{ ok: true; apiKey: string; modelId: string } | { ok: false; error: string }> {
  const online = await loadOnlineSettings()
  if (!online.enabled) return { ok: false, error: 'Online AI is off.' }
  const apiKey = await readOpenRouterKey()
  if (!apiKey) return { ok: false, error: 'No OpenRouter API key is saved.' }

  const modelId = store.getModel(db, online.defaultModel)
  const catalog = await getCachedCatalog()
  const model = catalog.models.find((m) => m.id === modelId)
  // Same rule as memory extraction: a background lookup is not a moment where
  // the user is choosing, so weaker retention guarantees are refused, not offered.
  if (model && !model.zdrAvailable) {
    return {
      ok: false,
      error: `${model.name} has no provider enforcing zero data retention. Pick another model in Settings.`
    }
  }
  return { ok: true, apiKey, modelId }
}

async function askModel(params: {
  apiKey: string
  modelId: string
  system: string
  user: string
  responseFormat: unknown
  maxResults: number
}): Promise<unknown> {
  let body = ''
  await streamChatCompletion(
    {
      apiKey: params.apiKey,
      model: params.modelId,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user }
      ],
      signal: new AbortController().signal,
      responseFormat: params.responseFormat,
      enforceZdr: true,
      webSearch: { maxResults: params.maxResults }
    },
    { onToken: (t) => (body += t), onDone: () => {} }
  )
  return JSON.parse(body)
}

function describe(err: unknown): string {
  if (err instanceof OpenRouterError) return err.message
  if (err instanceof SyntaxError) return 'The lookup did not return usable data.'
  return 'The lookup failed.'
}

/** Adds a name and starts identifying who is meant. */
export async function addRoleModel(query: string): Promise<RoleModelResult> {
  const db = host?.db()
  if (!db) return { ok: false, error: 'Journal is locked.' }
  if (!store.isEnabled(db)) return { ok: false, error: 'Role models are off.' }
  const trimmed = query.trim()
  if (!trimmed) return { ok: false, error: 'Type a name first.' }
  if (trimmed.length > 120) return { ok: false, error: 'That name is too long.' }

  const model = store.create(db, trimmed)
  notify()
  void identify(model.id, null)
  return { ok: true }
}

/**
 * One round of "who did you mean?". `hint` carries the extra detail the user
 * typed when the previous round missed.
 */
export async function identify(id: string, hint: string | null): Promise<void> {
  const db = host?.db()
  if (!db || inFlight.has(id)) return
  const vaultAtStart = host?.vaultGeneration() ?? 0
  inFlight.add(id)

  try {
    const model = store.get(db, id)
    if (!model) return

    if (model.rounds >= MAX_DISAMBIGUATION_ROUNDS) {
      // The cap exists so this cannot keep guessing. Hand it back to the user.
      store.setStatus(
        db,
        id,
        'error',
        `Could not pin down who you meant after ${MAX_DISAMBIGUATION_ROUNDS} tries. Remove this and try a more specific name — add their field, a book, or a company.`
      )
      notify()
      return
    }

    const pre = await ready(db)
    if (!pre.ok) {
      store.setStatus(db, id, 'error', pre.error)
      notify()
      return
    }

    store.setStatus(db, id, 'identifying')
    notify()

    const rejected = model.candidates.map((c) => c.name)
    const user = [
      `Who might this be: "${model.query}"?`,
      hint ? `The user added this detail: ${hint}` : '',
      rejected.length > 0
        ? `These were already rejected as wrong, do not offer them again: ${rejected.join('; ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n')

    const raw = await askModel({
      apiKey: pre.apiKey,
      modelId: pre.modelId,
      system: IDENTIFY_INSTRUCTION,
      user,
      responseFormat: IDENTIFY_RESPONSE_FORMAT,
      maxResults: IDENTIFY_SEARCH_RESULTS
    })

    if (host?.vaultGeneration() !== vaultAtStart) return
    const currentDb = host?.db()
    if (!currentDb) return

    const candidates = validateCandidates(raw).filter((c) => !rejected.includes(c.name))
    if (candidates.length === 0) {
      store.setStatus(
        currentDb,
        id,
        'error',
        'No public figure matched that name. Try adding their field or something they are known for.'
      )
    } else {
      store.setCandidates(currentDb, id, candidates)
    }
    notify()
  } catch (err) {
    const currentDb = host?.db()
    if (currentDb && host?.vaultGeneration() === vaultAtStart) {
      store.setStatus(currentDb, id, 'error', describe(err))
      notify()
    }
  } finally {
    inFlight.delete(id)
  }
}

/** The user picked one of the offered candidates; build the profile. */
export async function confirmCandidate(id: string, name: string): Promise<RoleModelResult> {
  const db = host?.db()
  if (!db) return { ok: false, error: 'Journal is locked.' }
  const model = store.get(db, id)
  if (!model) return { ok: false, error: 'That role model no longer exists.' }
  const candidate = model.candidates.find((c) => c.name === name)
  if (!candidate) return { ok: false, error: 'That candidate is no longer offered.' }

  store.confirmIdentity(db, id, candidate)
  notify()
  void buildProfile(id)
  return { ok: true }
}

/** None of the candidates were right; try again with a hint, within the cap. */
export async function rejectCandidates(id: string, hint: string): Promise<RoleModelResult> {
  const db = host?.db()
  if (!db) return { ok: false, error: 'Journal is locked.' }
  const model = store.get(db, id)
  if (!model) return { ok: false, error: 'That role model no longer exists.' }
  if (model.rounds >= MAX_DISAMBIGUATION_ROUNDS) {
    return { ok: false, error: 'Out of attempts — remove this and try a more specific name.' }
  }
  void identify(id, hint.trim() || null)
  return { ok: true }
}

export async function buildProfile(id: string): Promise<void> {
  const db = host?.db()
  if (!db || inFlight.has(id)) return
  const vaultAtStart = host?.vaultGeneration() ?? 0
  inFlight.add(id)

  try {
    const model = store.get(db, id)
    if (!model || !model.name) return

    const pre = await ready(db)
    if (!pre.ok) {
      store.setStatus(db, id, 'error', pre.error)
      notify()
      return
    }

    store.setStatus(db, id, 'building')
    notify()

    const who = [model.name, model.distinguisher, model.lifespan].filter(Boolean).join(' — ')

    // Two passes rather than one. Asking for the narrative, six sections of
    // sourced claims and the frameworks in a single response produced a profile
    // that stopped after "known for" — the output budget ran out before the
    // sections that actually matter. Each pass now has room to finish.
    const [profileRaw, frameworksRaw] = await Promise.all([
      askModel({
        apiKey: pre.apiKey,
        modelId: pre.modelId,
        system: PROFILE_INSTRUCTION,
        user: `Build the profile for: ${who}`,
        responseFormat: PROFILE_RESPONSE_FORMAT,
        maxResults: PROFILE_SEARCH_RESULTS
      }),
      askModel({
        apiKey: pre.apiKey,
        modelId: pre.modelId,
        system: FRAMEWORKS_INSTRUCTION,
        user: `Extract the decision-making frameworks of: ${who}`,
        responseFormat: FRAMEWORKS_RESPONSE_FORMAT,
        maxResults: PROFILE_SEARCH_RESULTS
      }).catch(() => ({ frameworks: [] }))
    ])

    if (host?.vaultGeneration() !== vaultAtStart) return
    const currentDb = host?.db()
    if (!currentDb) return

    const profile = validateProfile({
      ...(profileRaw as Record<string, unknown>),
      frameworks: (frameworksRaw as { frameworks?: unknown }).frameworks ?? []
    })
    if (profile.claims.length === 0) {
      store.setStatus(
        currentDb,
        id,
        'error',
        'Nothing could be established from sources for this person. Nothing has been saved.'
      )
      notify()
      return
    }

    store.saveProfile(currentDb, id, profile)
    if (profile.droppedForNoSource > 0) {
      console.warn(
        `[rolemodels] dropped ${profile.droppedForNoSource} unsourced claim(s) for ${model.name}`
      )
    }
    notify()
  } catch (err) {
    const currentDb = host?.db()
    if (currentDb && host?.vaultGeneration() === vaultAtStart) {
      store.setStatus(currentDb, id, 'error', describe(err))
      notify()
    }
  } finally {
    inFlight.delete(id)
  }
}
