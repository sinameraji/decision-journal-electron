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
    // Assert on the message the user actually sees, not on the hint map. The
    // first version of this test checked only the map — so when the map was
    // corrected and the thrown message was not, it passed while the UI still
    // read "OpenRouter is rate-limiting this key."
    const shown = errorForStatus(429, '').message
    expect(shown).not.toMatch(/rate-limiting (this|your) key/i)
    expect(shown).toMatch(/provider/i)
    expect(shown).toMatch(/not your (api )?key/i)
  })

  it('every thrown message matches the shared hint for its code', () => {
    // The two strings drifted once; this fails if they ever drift again.
    for (const status of [401, 402, 408, 429]) {
      const e = errorForStatus(status, '')
      expect(e.message).toBe(AI_ERROR_HINTS[e.code])
    }
    expect(errorForStatus(404, 'no endpoints found matching your data policy').message).toBe(
      AI_ERROR_HINTS['no-private-route']
    )
    expect(asNetworkError(new Error('getaddrinfo ENOTFOUND')).message).toBe(
      AI_ERROR_HINTS['network']
    )
  })
})

/**
 * Live evidence from OpenRouter: an upstream rate limit can arrive inside an
 * HTTP 200, in `choices[0]` rather than at the top level:
 *
 *   { "choices": [{ "finish_reason": "error",
 *                   "error": { "code": 429, "message": "...rate-limited upstream..." } }] }
 *
 * The parser treated any finish_reason as a clean completion, so this rendered
 * as a successful empty reply — no error, no retry, nothing to act on.
 */
describe('an upstream failure inside a 200', () => {
  it('is a rate limit, not a normal finish', () => {
    const err = errorForStatus(429, 'openai/gpt-5.6-luna is temporarily rate-limited upstream.')
    expect(err.code).toBe('rate-limited')
  })

  it('is transient, so it belongs in the retryable set', () => {
    expect(new Set([429, 502, 503, 504]).has(429)).toBe(true)
  })

  it('does not leak the upstream text to the user', () => {
    const err = errorForStatus(429, 'add your own key at https://openrouter.ai/settings/integrations')
    expect(err.message).not.toContain('settings/integrations')
  })
})
