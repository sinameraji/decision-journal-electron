import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { totalmem } from 'node:os'
import { unlinkSync } from 'node:fs'
import type Database from 'better-sqlite3-multiple-ciphers'
import type {
  CatalogModel,
  ChatMsg,
  DecisionCreateInput,
  DecisionReviewInput,
  DecisionUpdateInput,
  ExportResult,
  ImportResult,
  ReplaceFromBackupResult,
  InstalledModel,
  ModelInfo,
  OllamaEvent,
  OllamaStatus,
  ThemeMode,
  UnlockResult,
  VaultStatus,
  WhisperModelInfo,
  WhisperStatus
} from '@shared/ipc-contract'
import { MODEL_CATALOG as OLLAMA_CATALOG } from '@shared/models'
import { Vault, isValidPinFormat } from './crypto/vault'
import { canPromptTouchId, promptTouchId } from './crypto/keychain'
import { closeDb, openEncryptedDb } from './db/open'
import {
  createDecision,
  deleteDecision,
  getDecision,
  listDecisions,
  reviewDecision,
  searchDecisions,
  updateDecision
} from './db/decisions'
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversationMessages,
  listConversations
} from './db/conversations'
import {
  chatStream,
  deleteModel as deleteOllamaModel,
  getVersion,
  listTags,
  OllamaNotRunningError,
  pullModel,
  showModel,
  type ChatMessageIn
} from './ollama/client'
import { classifyModel, getHardwareProfile } from './ollama/hardware'
import { buildCoachSystemPrompt } from './ollama/systemPrompt'
import { applyThemeMode, loadThemePreference, saveThemePreference } from './theme'
import { checkForUpdates, downloadUpdate, installUpdate } from './updater'
import { loadUpdatePrefs, saveUpdatePrefs } from './updatePrefs'
import { MODEL_CATALOG, listInstalled, isInstalled, modelPath } from './whisper/models'
import { getActiveModel, setActiveModel } from './whisper/config'
import { downloadModel, cancelDownload } from './whisper/download'
import { transcribe, freeEngine } from './whisper/engine'

const ALLOWED_EXTERNAL_URL_PREFIXES = [
  'https://github.com/sinameraji/',
  'https://fs.blog/decision-journal/'
]

const OLLAMA_EXTERNAL_URL_ALLOWLIST = new Set([
  'https://ollama.com',
  'https://ollama.com/',
  'https://ollama.com/download',
  'https://ollama.com/library',
  'https://github.com/ollama/ollama'
])

function isAllowedExternalUrl(url: string): boolean {
  return ALLOWED_EXTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix))
}

function isAllowedOllamaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    if (parsed.hostname !== 'ollama.com' && parsed.hostname !== 'github.com') return false
    return OLLAMA_EXTERNAL_URL_ALLOWLIST.has(url)
  } catch {
    return false
  }
}

function backupFolderName(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `decision-journal-backup-${y}-${m}-${day}`
}

type DB = Database.Database

interface Session {
  db: DB | null
  masterKey: Buffer | null
}

const session: Session = { db: null, masterKey: null }

const activeRequests = new Map<string, AbortController>()

function sendOllamaEvent(evt: OllamaEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('ollama:event', evt)
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof OllamaNotRunningError) return 'Ollama is not running'
  if (err instanceof Error) return err.message
  return String(err)
}

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
    for (const controller of activeRequests.values()) controller.abort()
    activeRequests.clear()
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

  ipcMain.handle(
    'decisions:review',
    async (_evt, id: string, input: DecisionReviewInput) => {
      if (!session.db) throw new Error('Database is locked')
      return reviewDecision(session.db, id, input)
    }
  )

  ipcMain.handle('decisions:delete', async (_evt, id: string) => {
    if (!session.db) throw new Error('Database is locked')
    return deleteDecision(session.db, id)
  })

  // ---------------- Conversations ----------------

  ipcMain.handle('conversations:create', async (_evt, modelId: string, title: string) => {
    if (!session.db) throw new Error('Database is locked')
    return createConversation(session.db, modelId, title)
  })

  ipcMain.handle('conversations:list', async () => {
    if (!session.db) return []
    return listConversations(session.db)
  })

  ipcMain.handle('conversations:messages', async (_evt, id: string) => {
    if (!session.db) return []
    return getConversationMessages(session.db, id)
  })

  ipcMain.handle(
    'conversations:append-message',
    async (_evt, id: string, role: string, content: string) => {
      if (!session.db) throw new Error('Database is locked')
      appendMessage(session.db, id, role, content)
    }
  )

  ipcMain.handle('conversations:delete', async (_evt, id: string) => {
    if (!session.db) throw new Error('Database is locked')
    deleteConversation(session.db, id)
  })

  ipcMain.handle('theme:get', async (): Promise<ThemeMode> => loadThemePreference())

  ipcMain.handle('theme:set', async (_evt, mode: ThemeMode): Promise<void> => {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return
    await saveThemePreference(mode)
    applyThemeMode(mode)
  })

  ipcMain.handle('app:version', async () => app.getVersion())
  ipcMain.handle('app:platform', async () => process.platform)

  ipcMain.handle('app:quit', async (): Promise<void> => {
    app.quit()
  })

  ipcMain.handle(
    'app:open-external',
    async (_evt, url: string): Promise<{ ok: boolean; error?: string }> => {
      if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
        return { ok: false, error: 'url-not-allowed' }
      }
      try {
        await shell.openExternal(url)
        return { ok: true }
      } catch (err) {
        console.error('[app:open-external]', err)
        return { ok: false, error: 'internal' }
      }
    }
  )

  ipcMain.handle('vault:export', async (evt): Promise<ExportResult> => {
    if (!session.masterKey) return { ok: false, error: 'not-unlocked' }
    const win = BrowserWindow.fromWebContents(evt.sender)
    const picked = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose backup destination',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: 'Choose backup destination',
          properties: ['openDirectory', 'createDirectory']
        })
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, error: 'canceled' }
    }
    const destRoot = picked.filePaths[0]
    const destDir = join(destRoot, backupFolderName())
    try {
      await fs.mkdir(destDir, { recursive: true })
      const vault = getVault()
      const portableJson = await vault.exportPortable()
      await fs.writeFile(join(destDir, 'vault.json'), portableJson, {
        encoding: 'utf8',
        mode: 0o600
      })
      await fs.copyFile(dbPath(), join(destDir, 'decisions.db'))
      return { ok: true, path: destDir }
    } catch (err) {
      console.error('[vault:export]', err)
      return { ok: false, error: 'internal' }
    }
  })

  ipcMain.handle('vault:pick-import-folder', async (evt): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    const picked = win
      ? await dialog.showOpenDialog(win, {
          title: 'Choose backup folder',
          properties: ['openDirectory']
        })
      : await dialog.showOpenDialog({
          title: 'Choose backup folder',
          properties: ['openDirectory']
        })
    if (picked.canceled || picked.filePaths.length === 0) return null
    return picked.filePaths[0]
  })

  ipcMain.handle(
    'vault:import',
    async (_evt, folder: string, pin: string): Promise<ImportResult> => {
      if (typeof folder !== 'string' || !folder) return { ok: false, error: 'invalid-folder' }
      if (!isValidPinFormat(pin)) return { ok: false, error: 'wrong-pin' }
      const srcVault = join(folder, 'vault.json')
      const srcDb = join(folder, 'decisions.db')
      try {
        await fs.access(srcVault)
        await fs.access(srcDb)
      } catch {
        return { ok: false, error: 'invalid-folder' }
      }
      try {
        await fs.access(dbPath())
        return { ok: false, error: 'db-exists' }
      } catch {
        // expected: no existing db
      }
      try {
        const portableJson = await fs.readFile(srcVault, 'utf8')
        const vault = getVault()
        await vault.writePortable(portableJson)
        const unlockResult = await vault.unlock(pin)
        if (!unlockResult.ok) {
          await fs.rm(vaultPath(), { force: true })
          return { ok: false, error: 'wrong-pin' }
        }
        await fs.copyFile(srcDb, dbPath())
        await vault.sealLocally()
        await hydrateDb(unlockResult.masterKey)
        return { ok: true }
      } catch (err) {
        console.error('[vault:import]', err)
        try {
          await fs.rm(vaultPath(), { force: true })
        } catch {
          // best-effort cleanup
        }
        return { ok: false, error: 'internal' }
      }
    }
  )

  ipcMain.handle(
    'vault:replace-from-backup',
    async (_evt, folder: string, pin: string): Promise<ReplaceFromBackupResult> => {
      if (!session.db) return { ok: false, error: 'not-unlocked' }
      if (typeof folder !== 'string' || !folder) return { ok: false, error: 'invalid-folder' }
      if (!isValidPinFormat(pin)) return { ok: false, error: 'wrong-pin' }

      const srcVault = join(folder, 'vault.json')
      const srcDb = join(folder, 'decisions.db')
      try {
        await fs.access(srcVault)
        await fs.access(srcDb)
      } catch {
        return { ok: false, error: 'invalid-folder' }
      }

      // Verify backup PIN before destroying anything
      const portableJson = await fs.readFile(srcVault, 'utf8')
      const verifyPath = vaultPath() + '.verify'
      try {
        const tempVault = new Vault(verifyPath)
        await tempVault.writePortable(portableJson)
        const verifyResult = await tempVault.unlock(pin)
        await fs.rm(verifyPath, { force: true })
        if (!verifyResult.ok) return { ok: false, error: 'wrong-pin' }
        verifyResult.masterKey.fill(0)
      } catch {
        await fs.rm(verifyPath, { force: true })
        return { ok: false, error: 'wrong-pin' }
      }

      // Tear down current session
      for (const controller of activeRequests.values()) controller.abort()
      activeRequests.clear()
      closeDb(session.db)
      zeroBuffer(session.masterKey)
      session.db = null
      session.masterKey = null

      // Move current files aside as safety net
      try { await fs.rename(vaultPath(), vaultPath() + '.replaced') } catch { /* may not exist */ }
      try { await fs.rename(dbPath(), dbPath() + '.replaced') } catch { /* may not exist */ }
      try { await fs.rm(dbPath() + '-wal', { force: true }) } catch { /* ignore */ }
      try { await fs.rm(dbPath() + '-shm', { force: true }) } catch { /* ignore */ }

      try {
        const vault = getVault()
        await vault.writePortable(portableJson)
        const unlockResult = await vault.unlock(pin)
        if (!unlockResult.ok) throw new Error('unlock failed after verification')
        await fs.copyFile(srcDb, dbPath())
        await vault.sealLocally()
        await hydrateDb(unlockResult.masterKey)

        // Success — clean up old files
        await fs.rm(vaultPath() + '.replaced', { force: true })
        await fs.rm(dbPath() + '.replaced', { force: true })

        return { ok: true }
      } catch (err) {
        console.error('[vault:replace-from-backup]', err)
        // Attempt rollback
        try {
          await fs.rm(vaultPath(), { force: true })
          await fs.rm(dbPath(), { force: true })
          await fs.rename(vaultPath() + '.replaced', vaultPath()).catch(() => {})
          await fs.rename(dbPath() + '.replaced', dbPath()).catch(() => {})
        } catch { /* best-effort */ }
        return { ok: false, error: 'internal' }
      }
    }
  )

  ipcMain.handle('transcription:status', async (): Promise<WhisperStatus> => ({
    activeModel: getActiveModel(),
    installedModels: listInstalled(),
    totalMemGB: Math.round(totalmem() / (1024 ** 3))
  }))

  ipcMain.handle('transcription:available-models', async (): Promise<WhisperModelInfo[]> =>
    MODEL_CATALOG.map(({ name, label, sizeBytes, sizeLabel, description }) => ({
      name,
      label,
      sizeBytes,
      sizeLabel,
      description
    }))
  )

  ipcMain.handle('transcription:download', async (_evt, name: string): Promise<void> => {
    await downloadModel(name)
    if (!getActiveModel()) setActiveModel(name)
  })

  ipcMain.handle('transcription:cancel-download', async (): Promise<void> => {
    cancelDownload()
  })

  ipcMain.handle('transcription:set-active', async (_evt, name: string): Promise<void> => {
    if (!isInstalled(name)) throw new Error(`Model "${name}" is not installed`)
    setActiveModel(name)
  })

  ipcMain.handle('transcription:delete', async (_evt, name: string): Promise<void> => {
    const path = modelPath(name)
    if (isInstalled(name)) unlinkSync(path)
    if (getActiveModel() === name) setActiveModel(listInstalled()[0] ?? '')
    await freeEngine()
  })

  ipcMain.handle('transcription:transcribe', async (_evt, buffer: ArrayBuffer): Promise<string> => {
    const samples = new Float32Array(buffer)
    return transcribe(samples)
  })

  // ---------------- Ollama ----------------

  ipcMain.handle('ollama:status', async (): Promise<OllamaStatus> => {
    const hardware = getHardwareProfile()
    try {
      const version = await getVersion()
      return { running: true, version, hardware }
    } catch {
      return { running: false, version: null, hardware }
    }
  })

  ipcMain.handle('ollama:list-installed', async (): Promise<InstalledModel[]> => {
    try {
      const tags = await listTags()
      return tags.map((t) => ({
        id: t.name,
        sizeBytes: t.size,
        modifiedAt: Date.parse(t.modified_at) || 0,
        digest: t.digest,
        parameterSize: t.details?.parameter_size ?? null,
        quantization: t.details?.quantization_level ?? null
      }))
    } catch {
      return []
    }
  })

  ipcMain.handle('ollama:catalog', async (): Promise<CatalogModel[]> => {
    const profile = getHardwareProfile()
    let installedIds = new Set<string>()
    try {
      const tags = await listTags()
      installedIds = new Set(tags.map((t) => t.name))
    } catch {
      // Ollama not running — return catalog with installed=false for all.
    }
    return OLLAMA_CATALOG.map((entry) => {
      const { fit, reason } = classifyModel(entry, profile)
      return {
        ...entry,
        fit,
        fitReason: reason,
        installed: installedIds.has(entry.id)
      }
    })
  })

  ipcMain.handle('ollama:pull', async (_evt, modelId: string): Promise<string> => {
    const requestId = randomUUID()
    const controller = new AbortController()
    activeRequests.set(requestId, controller)

    void (async () => {
      try {
        for await (const progress of pullModel(modelId, controller.signal)) {
          if (progress.error) {
            sendOllamaEvent({ requestId, type: 'error', message: progress.error })
            return
          }
          sendOllamaEvent({
            requestId,
            type: 'pull-progress',
            status: progress.status,
            completed: progress.completed,
            total: progress.total
          })
        }
        sendOllamaEvent({ requestId, type: 'done' })
      } catch (err) {
        if (controller.signal.aborted) {
          sendOllamaEvent({ requestId, type: 'cancelled' })
        } else {
          sendOllamaEvent({ requestId, type: 'error', message: errorMessage(err) })
        }
      } finally {
        activeRequests.delete(requestId)
      }
    })()

    return requestId
  })

  ipcMain.handle('ollama:cancel', async (_evt, requestId: string): Promise<void> => {
    const controller = activeRequests.get(requestId)
    if (controller) controller.abort()
  })

  ipcMain.handle(
    'ollama:remove',
    async (_evt, modelId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await deleteOllamaModel(modelId)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: errorMessage(err) }
      }
    }
  )

  ipcMain.handle('ollama:show', async (_evt, modelId: string): Promise<ModelInfo | null> => {
    try {
      const raw = await showModel(modelId)
      const tags = await listTags().catch(() => [])
      const tag = tags.find((t) => t.name === modelId)
      return {
        id: modelId,
        parameterSize: raw.details?.parameter_size ?? null,
        quantization: raw.details?.quantization_level ?? null,
        family: raw.details?.family ?? null,
        license: raw.license ? raw.license.slice(0, 500) : null,
        sizeBytes: tag?.size ?? 0
      }
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'ollama:chat',
    async (_evt, modelId: string, messages: ChatMsg[]): Promise<string> => {
      const requestId = randomUUID()
      const controller = new AbortController()
      activeRequests.set(requestId, controller)

      const systemPrompt = buildCoachSystemPrompt(session.db)
      const fullMessages: ChatMessageIn[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ]

      void (async () => {
        try {
          for await (const chunk of chatStream(modelId, fullMessages, controller.signal)) {
            if (chunk.error) {
              sendOllamaEvent({ requestId, type: 'error', message: chunk.error })
              return
            }
            const token = chunk.message?.content ?? ''
            if (token) {
              sendOllamaEvent({ requestId, type: 'chat-token', token })
            }
            if (chunk.done) {
              sendOllamaEvent({ requestId, type: 'done' })
              return
            }
          }
          sendOllamaEvent({ requestId, type: 'done' })
        } catch (err) {
          if (controller.signal.aborted) {
            sendOllamaEvent({ requestId, type: 'cancelled' })
          } else {
            sendOllamaEvent({ requestId, type: 'error', message: errorMessage(err) })
          }
        } finally {
          activeRequests.delete(requestId)
        }
      })()

      return requestId
    }
  )

  ipcMain.handle('app:check-for-updates', async (): Promise<void> => {
    await checkForUpdates()
  })

  ipcMain.handle('app:download-update', async (): Promise<void> => {
    await downloadUpdate()
  })

  ipcMain.handle('app:install-update', async (): Promise<void> => {
    installUpdate()
  })

  ipcMain.handle('app:get-auto-update-enabled', async (): Promise<boolean> => {
    const prefs = await loadUpdatePrefs()
    return prefs.autoCheckEnabled
  })

  ipcMain.handle(
    'app:set-auto-update-enabled',
    async (_evt, enabled: boolean): Promise<void> => {
      await saveUpdatePrefs({ autoCheckEnabled: enabled })
    }
  )

  ipcMain.handle('ollama:open-external', async (_evt, url: string): Promise<void> => {
    if (!isAllowedOllamaUrl(url)) {
      console.warn('[ollama:open-external] blocked', url)
      return
    }
    await shell.openExternal(url)
  })
}

export function clearSessionOnQuit(): void {
  for (const controller of activeRequests.values()) controller.abort()
  activeRequests.clear()
  closeDb(session.db)
  zeroBuffer(session.masterKey)
  session.db = null
  session.masterKey = null
}

export function currentSystemIsDark(): boolean {
  return nativeTheme.shouldUseDarkColors
}
