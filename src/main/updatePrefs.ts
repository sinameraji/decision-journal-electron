import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const PREFS_FILE = (): string => join(app.getPath('userData'), 'update-prefs.json')

interface UpdatePrefs {
  autoCheckEnabled: boolean
}

const DEFAULTS: UpdatePrefs = { autoCheckEnabled: true }

export async function loadUpdatePrefs(): Promise<UpdatePrefs> {
  try {
    const raw = await fs.readFile(PREFS_FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<UpdatePrefs>
    return {
      autoCheckEnabled:
        typeof parsed.autoCheckEnabled === 'boolean'
          ? parsed.autoCheckEnabled
          : DEFAULTS.autoCheckEnabled
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveUpdatePrefs(prefs: UpdatePrefs): Promise<void> {
  await fs.writeFile(PREFS_FILE(), JSON.stringify(prefs), 'utf8')
}
