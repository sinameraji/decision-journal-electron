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
import { DEFAULT_ROLE_MODEL_MODEL, MAX_DISAMBIGUATION_ROUNDS } from '@shared/roleModels'
import { getCachedCatalog } from '../ai/catalog'
import { readOpenRouterKey } from '../ai/credentials'
import { loadOnlineSettings } from '../ai/settings'
import { OpenRouterError, streamChatCompletion } from '../ai/openrouterClient'
import {
  SOURCE_INSTRUCTION,
  SOURCE_RESPONSE_FORMAT,
  FRAMEWORKS_INSTRUCTION,
  FRAMEWORKS_RESPONSE_FORMAT,
  IDENTIFY_INSTRUCTION,
  IDENTIFY_RESPONSE_FORMAT,
  PROFILE_INSTRUCTION,
  PROFILE_RESPONSE_FORMAT
} from './prompt'
import * as store from './store'
import { isUsableSource, validateCandidates, validateProfile } from './validate'

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
/** Models with few zero-data-retention routes have no headroom when one is busy. */
const THIN_ROUTE_THRESHOLD = 4

async function ready(
  db: Database.Database
): Promise<
  | { ok: true; apiKey: string; modelId: string; thinRoutes: boolean; modelName: string }
  | { ok: false; error: string }
> {
  const online = await loadOnlineSettings()
  if (!online.enabled) return { ok: false, error: 'Online AI is off.' }
  const apiKey = await readOpenRouterKey()
  if (!apiKey) return { ok: false, error: 'No OpenRouter API key is saved.' }

  const modelId = store.getModel(db, DEFAULT_ROLE_MODEL_MODEL)
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
  return {
    ok: true,
    apiKey,
    modelId,
    modelName: model?.name ?? modelId,
    // An unknown count means we cannot claim the model is well served, so treat
    // it as thin rather than staying silent.
    thinRoutes: model ? (model.zdrProviderCount ?? 0) < THIN_ROUTE_THRESHOLD : false
  }
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

function describe(err: unknown, pre?: { thinRoutes: boolean; modelName: string }): string {
  if (err instanceof OpenRouterError) {
    // A lookup fires three search-backed calls in a row, so a model served by
    // only a couple of private routes runs out of headroom long before a chat
    // would. Say which model, and that a better-served one exists.
    if (err.code === 'rate-limited' && pre?.thinRoutes) {
      return `${err.message} ${pre.modelName} is served by only a few zero-data-retention providers, and a lookup makes several searches in a row. Choose a model with more of them in Settings → Role models.`
    }
    return err.message
  }
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
  let preflight: { thinRoutes: boolean; modelName: string } | undefined

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

    preflight = { thinRoutes: pre.thinRoutes, modelName: pre.modelName }
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
      store.setStatus(currentDb, id, 'error', describe(err, preflight))
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
  let preflight: { thinRoutes: boolean; modelName: string } | undefined

  try {
    const model = store.get(db, id)
    if (!model || !model.name) return

    const pre = await ready(db)
    if (!pre.ok) {
      store.setStatus(db, id, 'error', pre.error)
      notify()
      return
    }

    preflight = { thinRoutes: pre.thinRoutes, modelName: pre.modelName }
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
      store.setStatus(currentDb, id, 'error', describe(err, preflight))
      notify()
    }
  } finally {
    inFlight.delete(id)
  }
}

/**
 * Reads one document the user pointed at and appends what it adds.
 *
 * Someone with decades of published work cannot be captured by a single
 * lookup, so a profile grows: the user hands it an essay or a speech, and only
 * what that document actually supports is added. Retrieval is done by the
 * search plugin rather than by fetching the URL ourselves — that would mean
 * opening the network gate to any host the user pastes, which is a far larger
 * concession than this feature is worth.
 */
export async function addSource(id: string, url: string): Promise<RoleModelResult> {
  const db = host?.db()
  if (!db) return { ok: false, error: 'Journal is locked.' }
  const trimmed = url.trim()
  if (!isUsableSource(trimmed)) return { ok: false, error: 'That is not a web link.' }

  const model = store.get(db, id)
  if (!model || !model.name) return { ok: false, error: 'Finish identifying this person first.' }
  if (store.sourceAlreadyAdded(db, id, trimmed)) {
    return { ok: false, error: 'That source has already been read.' }
  }

  const sourceId = store.beginSource(db, id, trimmed)
  notify()
  void ingest(id, sourceId, trimmed, model.name)
  return { ok: true }
}

async function ingest(
  roleModelId: string,
  sourceId: string,
  url: string,
  personName: string
): Promise<void> {
  const db = host?.db()
  if (!db) return
  const vaultAtStart = host?.vaultGeneration() ?? 0
  let preflight: { thinRoutes: boolean; modelName: string } | undefined

  try {
    const pre = await ready(db)
    if (!pre.ok) {
      store.failSource(db, sourceId, pre.error)
      notify()
      return
    }
    preflight = { thinRoutes: pre.thinRoutes, modelName: pre.modelName }

    const existing = store.get(db, roleModelId)
    const already = (existing?.claims ?? []).map((c) => `- ${c.text}`).join('\n').slice(0, 4000)

    const raw = await askModel({
      apiKey: pre.apiKey,
      modelId: pre.modelId,
      system: SOURCE_INSTRUCTION,
      user: [
        `Person: ${personName}`,
        `Document to read: ${url}`,
        '',
        already ? `The profile already contains:\n${already}` : 'The profile is currently empty.'
      ].join('\n'),
      responseFormat: SOURCE_RESPONSE_FORMAT,
      maxResults: 4
    })

    if (host?.vaultGeneration() !== vaultAtStart) return
    const currentDb = host?.db()
    if (!currentDb) return

    const body = raw as { retrieved?: unknown; title?: unknown }
    if (body.retrieved === false) {
      store.failSource(
        currentDb,
        sourceId,
        'That page could not be read. It may be paywalled, blocked, or not indexed — try a different link to the same piece.'
      )
      notify()
      return
    }

    const parsed = validateProfile(raw)
    // Everything here comes from a document the user chose, so a claim citing
    // something else is not this source speaking and is not added.
    const fromThisSource = parsed.claims.filter((c) => sameDocument(c.sourceUrl, url))
    const frameworks = parsed.frameworks.filter(
      (f) => f.sourceUrl === null || sameDocument(f.sourceUrl, url)
    )

    if (fromThisSource.length === 0 && frameworks.length === 0) {
      store.failSource(
        currentDb,
        sourceId,
        'Nothing new was found in that document — either it repeats what is already recorded, or it says nothing about how they decide.'
      )
      notify()
      return
    }

    store.appendFromSource(currentDb, {
      roleModelId,
      sourceId,
      title: typeof body.title === 'string' ? body.title.slice(0, 160) : null,
      claims: fromThisSource.map((c) => ({ ...c, sourceUrl: url })),
      frameworks: frameworks.map((f) => ({ ...f, sourceUrl: url }))
    })
    notify()
  } catch (err) {
    const currentDb = host?.db()
    if (currentDb && host?.vaultGeneration() === vaultAtStart) {
      store.failSource(currentDb, sourceId, describe(err, preflight))
      notify()
    }
  }
}

/** Same page, ignoring trailing slashes, query strings and fragments. */
function sameDocument(a: string, b: string): boolean {
  const key = (u: string): string => {
    try {
      const p = new URL(u)
      return `${p.hostname.replace(/^www\./, '')}${p.pathname.replace(/\/$/, '')}`.toLowerCase()
    } catch {
      return u.toLowerCase()
    }
  }
  return key(a) === key(b)
}
