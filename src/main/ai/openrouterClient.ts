/**
 * OpenRouter HTTP client. Every request goes through the gated online session in
 * ./network.ts, so an accidental change of base URL or a redirect to another
 * host is cancelled by the session filter rather than silently followed.
 */

import type { AiUsage, OnlineModel } from '@shared/ai'
import { asNetworkError, errorForStatus, OpenRouterError } from './errors'
import { isAllowedOpenRouterUrl, onlineSession, OPENROUTER_API_PREFIX } from './network'
import { isDoneSentinel, SseParser } from './sse'

export { OpenRouterError, errorForStatus } from './errors'

const CONNECT_TIMEOUT_MS = 20_000
const IDLE_TIMEOUT_MS = 90_000
const OVERALL_TIMEOUT_MS = 10 * 60_000

const APP_TITLE = 'Decision Journal'

function headers(apiKey: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Title': APP_TITLE,
    // OpenRouter documents that per-request ZDR does not by itself make a
    // response ineligible for its response cache; this opts out explicitly.
    'X-OpenRouter-Cache': 'false'
  }
  if (apiKey) base['Authorization'] = `Bearer ${apiKey}`
  return base
}

async function gatedFetch(url: string, init: RequestInit): Promise<Response> {
  if (!isAllowedOpenRouterUrl(url)) {
    throw new OpenRouterError('internal', 'Refusing to request a non-allowlisted URL.')
  }
  const ses = onlineSession()
  // `redirect: 'error'` keeps a cross-origin redirect from being followed even
  // before the session filter would cancel it.
  return ses.fetch(url, { ...init, redirect: 'error', credentials: 'omit' })
}

// ---------------- Catalog ----------------

interface RawModel {
  id?: string
  name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

interface RawZdrEndpoint {
  model_id?: string
  model_name?: string
  context_length?: number
  pricing?: { prompt?: string; completion?: string }
  supported_parameters?: string[]
}

function perMillion(value: string | undefined): number | null {
  if (typeof value !== 'string') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n * 1_000_000
}

/**
 * Fetches the model catalog and the zero-data-retention endpoint list, and
 * returns only the models that have at least one ZDR route. Requests carrying
 * journal content are pinned to ZDR routing, so a model without one would only
 * ever produce a dead end for the user.
 */
export async function fetchOnlineCatalog(apiKey: string | null): Promise<OnlineModel[]> {
  const [modelsRes, zdrRes] = await Promise.all([
    gatedFetch(`${OPENROUTER_API_PREFIX}models`, {
      method: 'GET',
      headers: headers(apiKey),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    }),
    gatedFetch(`${OPENROUTER_API_PREFIX}endpoints/zdr`, {
      method: 'GET',
      headers: headers(apiKey),
      signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    })
  ])

  if (!modelsRes.ok) throw errorForStatus(modelsRes.status, '')
  if (!zdrRes.ok) throw errorForStatus(zdrRes.status, '')

  const modelsBody = (await modelsRes.json()) as { data?: RawModel[] }
  const zdrBody = (await zdrRes.json()) as { data?: RawZdrEndpoint[] }

  // A model can have several ZDR endpoints; keep the cheapest prompt price and
  // the union of structured-output support.
  const zdr = new Map<string, { model: OnlineModel }>()
  for (const e of zdrBody.data ?? []) {
    if (!e.model_id) continue
    const prompt = perMillion(e.pricing?.prompt)
    const completion = perMillion(e.pricing?.completion)
    const structured = (e.supported_parameters ?? []).includes('structured_outputs')
    const existing = zdr.get(e.model_id)
    if (!existing) {
      zdr.set(e.model_id, {
        model: {
          id: e.model_id,
          name: e.model_name ?? e.model_id,
          contextLength: e.context_length ?? 0,
          promptUsdPerMillion: prompt,
          completionUsdPerMillion: completion,
          supportsStructuredOutputs: structured,
          zdrAvailable: true
        }
      })
      continue
    }
    const m = existing.model
    if (prompt !== null && (m.promptUsdPerMillion === null || prompt < m.promptUsdPerMillion)) {
      m.promptUsdPerMillion = prompt
      m.completionUsdPerMillion = completion
    }
    m.supportsStructuredOutputs = m.supportsStructuredOutputs || structured
    m.contextLength = Math.max(m.contextLength, e.context_length ?? 0)
  }

  // Prefer the canonical /models entry for display name and context length.
  for (const m of modelsBody.data ?? []) {
    if (!m.id) continue
    const entry = zdr.get(m.id)
    if (!entry) continue
    entry.model.name = m.name ?? entry.model.name
    if (m.context_length) entry.model.contextLength = m.context_length
    entry.model.supportsStructuredOutputs =
      entry.model.supportsStructuredOutputs ||
      (m.supported_parameters ?? []).includes('structured_outputs')
  }

  return [...zdr.values()]
    .map((e) => e.model)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------- Chat completions ----------------

export interface ChatMessageOut {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onToken(token: string): void
  onDone(servedModel: string | null, usage: AiUsage | null): void
}

export interface ChatRequest {
  apiKey: string
  model: string
  messages: ChatMessageOut[]
  signal: AbortSignal
  /** JSON-schema structured output. Adds `require_parameters` routing. */
  responseFormat?: unknown
}

/**
 * Privacy routing applied to every request that can carry journal content.
 * `zdr: true` restricts routing to zero-data-retention endpoints and
 * `data_collection: 'deny'` excludes providers that may train on inputs. If no
 * route satisfies both, the request fails — it is never retried with these
 * relaxed.
 */
function providerRouting(requireParameters: boolean): Record<string, unknown> {
  const routing: Record<string, unknown> = { zdr: true, data_collection: 'deny' }
  // Only demand exact parameter support when we actually depend on a parameter.
  // Several ZDR routes advertise `max_completion_tokens` rather than
  // `max_tokens`, so a blanket requirement would exclude them.
  if (requireParameters) routing.require_parameters = true
  return routing
}

export async function streamChatCompletion(
  req: ChatRequest,
  cb: StreamCallbacks
): Promise<void> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    stream: true,
    usage: { include: true },
    provider: providerRouting(req.responseFormat !== undefined)
  }
  if (req.responseFormat !== undefined) body.response_format = req.responseFormat

  const overall = new AbortController()
  const onOuterAbort = (): void => overall.abort()
  req.signal.addEventListener('abort', onOuterAbort, { once: true })
  const overallTimer = setTimeout(() => overall.abort(), OVERALL_TIMEOUT_MS)

  try {
    let res: Response
    try {
      res = await gatedFetch(`${OPENROUTER_API_PREFIX}chat/completions`, {
        method: 'POST',
        headers: headers(req.apiKey),
        body: JSON.stringify(body),
        signal: overall.signal
      })
    } catch (err) {
      if (req.signal.aborted) throw new OpenRouterError('cancelled', 'Stopped.')
      throw asNetworkError(err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw errorForStatus(res.status, text)
    }
    if (!res.body) throw new OpenRouterError('provider', 'OpenRouter returned an empty response.')

    const reader = res.body.getReader()
    const parser = new SseParser()
    let servedModel: string | null = null
    let usage: AiUsage | null = null
    let sawContent = false
    let finished = false

    try {
      for (;;) {
        const chunk = await readWithIdleTimeout(reader, req.signal)
        if (chunk === 'aborted') throw new OpenRouterError('cancelled', 'Stopped.')
        if (chunk.done) {
          for (const evt of parser.end()) {
            const outcome = handleFrame(evt.data, cb, (m) => (servedModel = m), (u) => (usage = u))
            if (outcome === 'content') sawContent = true
            if (outcome === 'finished') finished = true
          }
          break
        }
        for (const evt of parser.push(chunk.value)) {
          const outcome = handleFrame(evt.data, cb, (m) => (servedModel = m), (u) => (usage = u))
          if (outcome === 'content') sawContent = true
          if (outcome === 'finished') finished = true
        }
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        // stream already closed
      }
    }

    if (!finished && !sawContent) {
      throw new OpenRouterError(
        'provider',
        'The stream ended before the model produced any output.'
      )
    }
    cb.onDone(servedModel, usage)
  } finally {
    clearTimeout(overallTimer)
    req.signal.removeEventListener('abort', onOuterAbort)
  }
}

type ReadResult = { done: false; value: Uint8Array } | { done: true; value: undefined }

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
): Promise<ReadResult | 'aborted'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OpenRouterError('timeout', 'OpenRouter stopped sending data.')),
      IDLE_TIMEOUT_MS
    )
  })
  try {
    const result = (await Promise.race([reader.read(), idle])) as ReadResult
    if (signal.aborted) return 'aborted'
    return result
  } catch (err) {
    if (signal.aborted) return 'aborted'
    if (err instanceof OpenRouterError) throw err
    throw asNetworkError(err)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface StreamChunk {
  model?: string
  choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: { message?: string; code?: number | string; metadata?: unknown }
}

/**
 * OpenRouter can report a provider failure *after* a 200 by sending an `error`
 * object inside the stream, so error handling cannot stop at the status code.
 */
function handleFrame(
  data: string,
  cb: StreamCallbacks,
  setModel: (m: string) => void,
  setUsage: (u: AiUsage) => void
): 'content' | 'finished' | 'none' {
  if (isDoneSentinel(data)) return 'finished'
  let parsed: StreamChunk
  try {
    parsed = JSON.parse(data) as StreamChunk
  } catch {
    return 'none'
  }

  if (parsed.error) {
    throw errorForStatus(
      typeof parsed.error.code === 'number' ? parsed.error.code : 500,
      parsed.error.message ?? ''
    )
  }

  if (parsed.model) setModel(parsed.model)
  if (parsed.usage) {
    setUsage({
      promptTokens: parsed.usage.prompt_tokens ?? null,
      completionTokens: parsed.usage.completion_tokens ?? null,
      costUsd: typeof parsed.usage.cost === 'number' ? parsed.usage.cost : null
    })
  }

  let emitted = false
  for (const choice of parsed.choices ?? []) {
    const token = choice.delta?.content
    if (typeof token === 'string' && token.length > 0) {
      cb.onToken(token)
      emitted = true
    }
    if (choice.finish_reason) return emitted ? 'content' : 'finished'
  }
  return emitted ? 'content' : 'none'
}
