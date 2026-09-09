/**
 * Provider error classification. Pure, so it can be unit-tested without an
 * Electron runtime.
 */

import type { AiErrorCode } from '@shared/ai'
import { AI_ERROR_HINTS } from '@shared/ai'

export class OpenRouterError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'OpenRouterError'
  }
}

/**
 * Builds an error whose message defaults to the shared hint for its code.
 *
 * These used to be two independent strings — a hint map and a hand-written
 * message at each throw site — and they drifted: the hint was corrected to say
 * the *provider* was rate-limiting, while the message the user actually saw
 * still blamed their API key. One source of truth per code prevents that.
 */
function make(code: AiErrorCode, message?: string): OpenRouterError {
  return new OpenRouterError(code, message ?? AI_ERROR_HINTS[code])
}

/**
 * Maps a status code plus response body to a code the UI can act on. The raw
 * provider body is inspected but never logged or surfaced verbatim.
 */
export function errorForStatus(status: number, body: string): OpenRouterError {
  const lower = body.toLowerCase()
  if (
    lower.includes('data policy') ||
    lower.includes('no allowed providers') ||
    lower.includes('no endpoints found') ||
    lower.includes('zdr')
  ) {
    return make('no-private-route')
  }
  if (lower.includes('context length') || lower.includes('maximum context')) {
    return make('context-too-large')
  }
  switch (status) {
    case 401:
      return make('invalid-key')
    case 402:
      return make('insufficient-credit')
    case 408:
      return make('timeout')
    case 429:
      return make('rate-limited')
    default:
      if (status >= 500) {
        return make('provider', 'OpenRouter or the model provider is unavailable.')
      }
      return make('provider', `OpenRouter returned an error (HTTP ${status}).`)
  }
}

export function asNetworkError(err: unknown): OpenRouterError {
  if (err instanceof OpenRouterError) return err
  const message = err instanceof Error ? err.message : String(err)
  if (/timed? ?out|timeout/i.test(message)) return make('timeout')
  return make('network')
}
