/**
 * The exact set of OpenRouter URLs this app is allowed to contact. Kept free of
 * Electron imports so it can be unit-tested directly.
 */

export const OPENROUTER_ORIGIN = 'https://openrouter.ai'
export const OPENROUTER_API_PREFIX = 'https://openrouter.ai/api/v1/'

const ALLOWED_PATHS = new Set([
  '/api/v1/chat/completions',
  '/api/v1/models',
  '/api/v1/endpoints/zdr',
  '/api/v1/key'
])

export function isAllowedOpenRouterUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.origin !== OPENROUTER_ORIGIN) return false
  return ALLOWED_PATHS.has(parsed.pathname)
}
