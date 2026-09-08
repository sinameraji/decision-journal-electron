import { describe, expect, it } from 'vitest'
import { isAllowedOpenRouterUrl } from '../endpoints'

describe('isAllowedOpenRouterUrl', () => {
  it('allows the exact API paths the app uses', () => {
    expect(isAllowedOpenRouterUrl('https://openrouter.ai/api/v1/chat/completions')).toBe(true)
    expect(isAllowedOpenRouterUrl('https://openrouter.ai/api/v1/models')).toBe(true)
    expect(isAllowedOpenRouterUrl('https://openrouter.ai/api/v1/endpoints/zdr')).toBe(true)
  })

  it('rejects other hosts, including lookalikes', () => {
    expect(isAllowedOpenRouterUrl('https://openrouter.ai.evil.com/api/v1/models')).toBe(false)
    expect(isAllowedOpenRouterUrl('https://evil.com/api/v1/chat/completions')).toBe(false)
    expect(isAllowedOpenRouterUrl('https://api.openrouter.ai/api/v1/models')).toBe(false)
  })

  it('rejects plaintext HTTP', () => {
    expect(isAllowedOpenRouterUrl('http://openrouter.ai/api/v1/models')).toBe(false)
  })

  it('rejects paths outside the allowlist', () => {
    expect(isAllowedOpenRouterUrl('https://openrouter.ai/api/v1/credits')).toBe(false)
    expect(isAllowedOpenRouterUrl('https://openrouter.ai/')).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(isAllowedOpenRouterUrl('not a url')).toBe(false)
    expect(isAllowedOpenRouterUrl('')).toBe(false)
  })
})
