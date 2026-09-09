/**
 * Locally cached OpenRouter model catalog.
 *
 * Only refreshed right after the user activates online AI, or when they press
 * Refresh. Nothing here contains journal content, so it is cached as plain JSON
 * next to the other preference files.
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { OnlineCatalog, OnlineModel } from '@shared/ai'
import { CATALOG_SHAPE_VERSION } from '@shared/ai'
import { fetchOnlineCatalog } from './openrouterClient'
import { loadOnlineSettings, saveOnlineSettings } from './settings'

const EMPTY: OnlineCatalog = { models: [], fetchedAt: 0, version: CATALOG_SHAPE_VERSION }

function catalogPath(): string {
  return join(app.getPath('userData'), 'online-catalog.json')
}

let cache: OnlineCatalog | null = null

export async function getCachedCatalog(): Promise<OnlineCatalog> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(catalogPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<OnlineCatalog>
    if (parsed.version !== CATALOG_SHAPE_VERSION) {
      // Written before a field existed. Treat it as absent rather than serving
      // entries with silently missing values.
      console.log('[catalog] cached catalog predates the current shape; discarding')
      cache = { ...EMPTY }
      return cache
    }
    cache = {
      models: Array.isArray(parsed.models) ? (parsed.models as OnlineModel[]) : [],
      fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0,
      version: CATALOG_SHAPE_VERSION
    }
  } catch {
    cache = { ...EMPTY }
  }
  return cache
}

let inFlight: Promise<OnlineCatalog> | null = null

/**
 * Returns the catalog, fetching it once if we do not have one.
 *
 * The cache is discarded whenever its shape changes, and for a while nothing
 * refilled it — only the two Refresh buttons did. The result was that online AI
 * could be on, with a valid key, and the model dropdown would simply show no
 * online models at all, with nothing to indicate why. A catalog holds no
 * journal content, so fetching it when online AI is already enabled is what the
 * user has asked for by enabling it.
 */
export async function ensureCatalog(apiKey: string | null): Promise<OnlineCatalog> {
  const current = await getCachedCatalog()
  if (current.models.length > 0) return current
  if (inFlight) return inFlight
  inFlight = refreshCatalog(apiKey)
    .catch(() => current)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Network call. Only reached from an explicit user action, or ensureCatalog. */
export async function refreshCatalog(apiKey: string | null): Promise<OnlineCatalog> {
  const models = await fetchOnlineCatalog(apiKey)
  const next: OnlineCatalog = {
    models,
    fetchedAt: Date.now(),
    version: CATALOG_SHAPE_VERSION
  }
  cache = next
  await fs.writeFile(catalogPath(), JSON.stringify(next), { encoding: 'utf8', mode: 0o600 })
  await saveOnlineSettings({ catalogFetchedAt: next.fetchedAt })
  return next
}

export async function clearCatalog(): Promise<void> {
  cache = { ...EMPTY }
  try {
    await fs.rm(catalogPath(), { force: true })
  } catch {
    // best-effort
  }
}

/** Context window for a model, when the cached catalog knows one. */
export async function contextLengthFor(modelId: string): Promise<number | null> {
  const catalog = await getCachedCatalog()
  const model = catalog.models.find((m) => m.id === modelId)
  return model?.contextLength ?? null
}

export async function catalogIsStale(): Promise<boolean> {
  const settings = await loadOnlineSettings()
  return settings.catalogFetchedAt === null
}
