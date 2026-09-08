import { describe, expect, it } from 'vitest'
import { AI_ERROR_HINTS } from '@shared/ai'
import { asNetworkError, errorForStatus, OpenRouterError } from '../errors'

describe('errorForStatus', () => {
  it('maps authentication and billing failures', () => {
    expect(errorForStatus(401, '').code).toBe('invalid-key')
    expect(errorForStatus(402, '').code).toBe('insufficient-credit')
    expect(errorForStatus(429, '').code).toBe('rate-limited')
    expect(errorForStatus(503, '').code).toBe('provider')
  })

  it('recognises a missing privacy-compatible route regardless of status', () => {
    expect(errorForStatus(404, 'No endpoints found matching your data policy').code).toBe(
      'no-private-route'
    )
    expect(errorForStatus(200, 'No allowed providers for this request').code).toBe(
      'no-private-route'
    )
  })

  it('recognises context overflow', () => {
    expect(errorForStatus(400, 'This model has a maximum context length of 8192').code).toBe(
      'context-too-large'
    )
  })

  it('never leaks the provider body into the user-facing message', () => {
    const err = errorForStatus(500, 'upstream said: token sk-secret-value leaked')
    expect(err.message).not.toContain('sk-secret-value')
  })
})

describe('asNetworkError', () => {
  it('passes through an already-classified error', () => {
    const original = new OpenRouterError('rate-limited', 'slow down')
    expect(asNetworkError(original)).toBe(original)
  })

  it('classifies timeouts separately from connection failures', () => {
    expect(asNetworkError(new Error('The operation timed out')).code).toBe('timeout')
    expect(asNetworkError(new Error('getaddrinfo ENOTFOUND')).code).toBe('network')
  })
})

/**
 * A 429 from an upstream provider arrives before any token streams, so nothing
 * was generated and nothing was billed. Those are the only failures the client
 * retries — a mid-stream failure must never be retried, because that would
 * duplicate a paid completion.
 */
describe('which failures are safe to retry', () => {
  const RETRYABLE = new Set([429, 502, 503, 504])

  it('retries transient upstream capacity failures', () => {
    for (const status of [429, 502, 503, 504]) {
      expect(RETRYABLE.has(status)).toBe(true)
    }
  })

  it('never retries a failure the user must act on', () => {
    for (const status of [400, 401, 402, 403, 404]) {
      expect(RETRYABLE.has(status)).toBe(false)
    }
  })

  it('a rate limit blames the provider, not the user\'s key', () => {
    // The old copy read "OpenRouter is rate-limiting this key", which sent the
    // user off to check an API key that was fine. The limit is upstream.
    const hint = AI_ERROR_HINTS['rate-limited']
    expect(hint).not.toMatch(/rate-limiting (this|your) key/i)
    expect(hint).toMatch(/provider/i)
    expect(hint).toMatch(/not your (api )?key/i)
  })
})
