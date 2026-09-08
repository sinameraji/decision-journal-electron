import { describe, expect, it } from 'vitest'
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
