/**
 * The only place in the app allowed to reach OpenRouter.
 *
 * The app-wide kill-switch in src/main/index.ts guards `session.defaultSession`,
 * which is what the renderer uses. Node's own HTTP stack (and this module) are
 * not covered by that filter, so online traffic gets its own non-persistent
 * session with an equally strict `webRequest` gate: exact origin, exact path
 * prefix, HTTPS only, no cookies, no cross-origin redirects.
 */

import { session, type Session } from 'electron'
import { isAllowedOpenRouterUrl } from './endpoints'

export { isAllowedOpenRouterUrl, OPENROUTER_API_PREFIX, OPENROUTER_ORIGIN } from './endpoints'

const PARTITION = 'openrouter-online-ai'

let cached: Session | null = null

/**
 * Non-persistent session used for every online request. Non-persistent means no
 * cookie jar or cache survives quit, so nothing about these requests is written
 * to disk.
 */
export function onlineSession(): Session {
  if (cached) return cached
  const ses = session.fromPartition(PARTITION, { cache: false })

  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isAllowedOpenRouterUrl(details.url)) {
      callback({ cancel: false })
      return
    }
    console.warn('[online-gate] blocked', new URL(details.url).origin)
    callback({ cancel: true })
  })

  // Strip anything that could carry ambient identity across requests.
  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    delete headers['Cookie']
    delete headers['cookie']
    callback({ requestHeaders: headers })
  })

  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  cached = ses
  return ses
}

/** Clears any in-memory state held by the online session. */
export async function resetOnlineSession(): Promise<void> {
  if (!cached) return
  try {
    await cached.clearStorageData()
    await cached.clearCache()
  } catch {
    // best-effort
  }
}
