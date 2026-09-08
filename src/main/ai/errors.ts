/**
 * Provider error classification. Pure, so it can be unit-tested without an
 * Electron runtime.
 */

import type { AiErrorCode } from '@shared/ai'

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
    return new OpenRouterError(
      'no-private-route',
      'No zero-data-retention route is available for this model right now.'
    )
  }
  if (lower.includes('context length') || lower.includes('maximum context')) {
    return new OpenRouterError(
      'context-too-large',
      'The request is longer than this model can accept.'
    )
  }
  switch (status) {
    case 401:
      return new OpenRouterError('invalid-key', 'OpenRouter rejected the API key.')
    case 402:
      return new OpenRouterError(
        'insufficient-credit',
        'Your OpenRouter account is out of credit.'
      )
    case 408:
      return new OpenRouterError('timeout', 'OpenRouter timed out.')
    case 429:
      return new OpenRouterError('rate-limited', 'OpenRouter is rate-limiting this key.')
    default:
      if (status >= 500) {
        return new OpenRouterError(
          'provider',
          'OpenRouter or the model provider is unavailable.'
        )
      }
      return new OpenRouterError('provider', `OpenRouter returned an error (HTTP ${status}).`)
  }
}

export function asNetworkError(err: unknown): OpenRouterError {
  if (err instanceof OpenRouterError) return err
  const message = err instanceof Error ? err.message : String(err)
  if (/timed? ?out|timeout/i.test(message)) {
    return new OpenRouterError('timeout', 'OpenRouter did not respond in time.')
  }
  return new OpenRouterError('network', 'Could not reach OpenRouter.')
}
