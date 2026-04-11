import { app, ipcMain, nativeTheme } from 'electron'
import { join } from 'node:path'
import type Database from 'better-sqlite3-multiple-ciphers'
import type {
  DecisionCreateInput,
  DecisionUpdateInput,
  ThemeMode,
  UnlockResult,
  VaultStatus
} from '@shared/ipc-contract'
import { Vault, isValidPinFormat } from './crypto/vault'
import { canPromptTouchId, promptTouchId } from './crypto/keychain'
import { closeDb, openEncryptedDb } from './db/open'
import { seedIfEmpty } from './db/seed'
import {
  createDecision,
  deleteDecision,
  getDecision,
  listDecisions,
  searchDecisions,
  updateDecision
} from './db/decisions'
import { applyThemeMode, loadThemePreference, saveThemePreference } from './theme'

type DB = Database.Database

interface Session {
  db: DB | null
  masterKey: Buffer | null
}

const session: Session = { db: null, masterKey: null }

function vaultPath(): string {
  return join(app.getPath('userData'), 'vault.json')
}

function dbPath(): string {
  return join(app.getPath('userData'), 'decisions.db')
}

function getVault(): Vault {
  return new Vault(vaultPath())
}

function zeroBuffer(buf: Buffer | null): void {
  if (buf) buf.fill(0)
}

async function hydrateDb(masterKey: Buffer): Promise<void> {
  session.db = await openEncryptedDb(dbPath(), masterKey)
  seedIfEmpty(session.db)
  session.masterKey = masterKey
}

export function registerIpcHandlers(): void {
  ipcMain.handle('vault:status', async (): Promise<VaultStatus> => {
    const vault = getVault()
    const base = await vault.getStatus()
    return { ...base, touchIdAvailable: canPromptTouchId() }
  })

  ipcMain.handle('vault:create', async (_evt, pin: string): Promise<UnlockResult> => {
    if (!isValidPinFormat(pin)) return { ok: false, error: 'invalid-format' }
    const vault = getVault()
    try {
      const masterKey = await vault.create(pin)
      await hydrateDb(masterKey)
      return { ok: true }
    } catch (err) {
      console.error('[vault:create]', err)
      return { ok: false, error: 'internal' }
    }
  })

  ipcMain.handle('vault:unlock', async (_evt, pin: string): Promise<UnlockResult> => {
    const vault = getVault()
    try {
      const result = await vault.unlock(pin)
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          cooldownUntil: result.cooldownUntil,
          failedAttempts: result.failedAttempts
        }
      }
      await hydrateDb(result.masterKey)
      return { ok: true }
    } catch (err) {
      console.error('[vault:unlock]', err)
      return { ok: false, error: 'internal' }
    }
  })

  ipcMain.handle('vault:lock', async (): Promise<void> => {
    closeDb(session.db)
    zeroBuffer(session.masterKey)
    session.db = null
    session.masterKey = null
  })

  ipcMain.handle(
    'vault:change-pin',
    async (_evt, currentPin: string, newPin: string): Promise<UnlockResult> => {
      const vault = getVault()
      try {
        const newMasterKey = await vault.changePin(currentPin, newPin)
        if (session.db) closeDb(session.db)
        zeroBuffer(session.masterKey)
        await hydrateDb(newMasterKey)
        return { ok: true }
      } catch (err) {
        console.error('[vault:change-pin]', err)
        return { ok: false, error: 'wrong-pin' }
      }
    }
  )

  ipcMain.handle(
    'vault:set-touchid',
    async (_evt, enabled: boolean, pin: string): Promise<{ ok: boolean; error?: string }> => {
      const vault = getVault()
      try {
        if (enabled) {
          if (!canPromptTouchId()) return { ok: false, error: 'Touch ID unavailable' }
          const result = await vault.unlock(pin)
          if (!result.ok) return { ok: false, error: 'Wrong PIN' }
          await vault.enableTouchId(result.masterKey)
          result.masterKey.fill(0)
          return { ok: true }
        } else {
          await vault.disableTouchId()
          return { ok: true }
        }
      } catch (err) {
        console.error('[vault:set-touchid]', err)
        return { ok: false, error: 'internal' }
      }
    }
  )

  ipcMain.handle(
    'vault:enable-touchid-current-session',
    async (): Promise<{ ok: boolean; error?: string }> => {
      if (!session.masterKey) return { ok: false, error: 'not unlocked' }
      if (!canPromptTouchId()) return { ok: false, error: 'Touch ID unavailable' }
      try {
        const vault = getVault()
        await vault.enableTouchId(session.masterKey)
        return { ok: true }
      } catch (err) {
        console.error('[vault:enable-touchid-current-session]', err)
        return { ok: false, error: 'internal' }
      }
    }
  )

  ipcMain.handle('vault:verify-pin', async (_evt, pin: string): Promise<UnlockResult> => {
    const vault = getVault()
    try {
      const result = await vault.unlock(pin)
      if (!result.ok) {
        return {
          ok: false,
          error: result.error,
          cooldownUntil: result.cooldownUntil,
          failedAttempts: result.failedAttempts
        }
      }
      result.masterKey.fill(0)
      return { ok: true }
    } catch (err) {
      console.error('[vault:verify-pin]', err)
      return { ok: false, error: 'internal' }
    }
  })

  ipcMain.handle(
    'vault:prompt-touchid-action',
    async (_evt, reason: string): Promise<{ ok: boolean }> => {
      if (!canPromptTouchId()) return { ok: false }
      const ok = await promptTouchId(reason)
      return { ok }
    }
  )

  ipcMain.handle('vault:unlock-touchid', async (): Promise<UnlockResult> => {
    const vault = getVault()
    try {
      const status = await vault.getStatus()
      if (!status.touchIdEnabled) return { ok: false, error: 'internal' }
      const authenticated = await promptTouchId('Unlock your Decision Journal')
      if (!authenticated) return { ok: false, error: 'wrong-pin' }
      const masterKey = await vault.unlockWithStoredTouchIdKey()
      await hydrateDb(masterKey)
      return { ok: true }
    } catch (err) {
      console.error('[vault:unlock-touchid]', err)
      return { ok: false, error: 'internal' }
    }
  })

  ipcMain.handle('decisions:list', async () => {
    if (!session.db) return []
    return listDecisions(session.db)
  })

  ipcMain.handle('decisions:search', async (_evt, query: string) => {
    if (!session.db) return []
    if (typeof query !== 'string') return []
    return searchDecisions(session.db, query)
  })

  ipcMain.handle('decisions:get', async (_evt, id: string) => {
    if (!session.db) return null
    return getDecision(session.db, id)
  })

  ipcMain.handle('decisions:create', async (_evt, input: DecisionCreateInput) => {
    if (!session.db) throw new Error('Database is locked')
    return createDecision(session.db, input)
  })

  ipcMain.handle(
    'decisions:update',
    async (_evt, id: string, patch: DecisionUpdateInput) => {
      if (!session.db) throw new Error('Database is locked')
      return updateDecision(session.db, id, patch)
    }
  )

  ipcMain.handle('decisions:delete', async (_evt, id: string) => {
    if (!session.db) throw new Error('Database is locked')
    deleteDecision(session.db, id)
  })

  ipcMain.handle('theme:get', async (): Promise<ThemeMode> => loadThemePreference())

  ipcMain.handle('theme:set', async (_evt, mode: ThemeMode): Promise<void> => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return
    await saveThemePreference(mode)
    applyThemeMode(mode)
  })

  ipcMain.handle('app:version', async () => app.getVersion())
  ipcMain.handle('app:platform', async () => process.platform)
}

export function clearSessionOnQuit(): void {
  closeDb(session.db)
  zeroBuffer(session.masterKey)
  session.db = null
  session.masterKey = null
}

export function currentSystemIsDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}
