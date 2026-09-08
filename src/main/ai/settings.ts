/**
 * Non-secret settings for the optional online provider.
 *
 * Stored next to the other main-process preference files (not in the journal
 * database) so that Settings can be read before the vault is unlocked without
 * ever touching journal content. `enabled` defaults to false on fresh installs
 * and on upgrade — reading this file must never turn online AI on.
 */

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_ONLINE_MODEL } from '@shared/ai'

export interface OnlineSettingsFile {
  enabled: boolean
  defaultModel: string
  consentGeneration: number
  catalogFetchedAt: number | null
}

const DEFAULTS: OnlineSettingsFile = {
  enabled: false,
  defaultModel: DEFAULT_ONLINE_MODEL,
  consentGeneration: 1,
  catalogFetchedAt: null
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'online-ai.json')
}

let cache: OnlineSettingsFile | null = null

export async function loadOnlineSettings(): Promise<OnlineSettingsFile> {
  if (cache) return { ...cache }
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<OnlineSettingsFile>
    cache = {
      enabled: parsed.enabled === true,
      defaultModel:
        typeof parsed.defaultModel === 'string' && parsed.defaultModel
          ? parsed.defaultModel
          : DEFAULTS.defaultModel,
      consentGeneration:
        typeof parsed.consentGeneration === 'number' && parsed.consentGeneration > 0
          ? parsed.consentGeneration
          : DEFAULTS.consentGeneration,
      catalogFetchedAt:
        typeof parsed.catalogFetchedAt === 'number' ? parsed.catalogFetchedAt : null
    }
  } catch {
    cache = { ...DEFAULTS }
  }
  return { ...cache }
}

export async function saveOnlineSettings(
  patch: Partial<OnlineSettingsFile>
): Promise<OnlineSettingsFile> {
  const current = await loadOnlineSettings()
  const next: OnlineSettingsFile = { ...current, ...patch }
  cache = next
  await fs.writeFile(settingsPath(), JSON.stringify(next, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
  return { ...next }
}

/**
 * Bumps the consent generation. Any request captured under an older generation
 * is dropped rather than committed — used when the user disables online AI,
 * removes the key, or restores a backup.
 */
export async function revokeOnlineConsent(): Promise<OnlineSettingsFile> {
  const current = await loadOnlineSettings()
  return saveOnlineSettings({
    enabled: false,
    consentGeneration: current.consentGeneration + 1,
    catalogFetchedAt: null
  })
}

/** Test seam: drops the in-memory copy so the next load re-reads from disk. */
export function resetOnlineSettingsCache(): void {
  cache = null
}
