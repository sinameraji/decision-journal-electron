import { contextBridge, ipcRenderer } from 'electron'
import type {
  Api,
  CatalogModel,
  ChatMsg,
  Decision,
  DecisionCreateInput,
  DecisionUpdateInput,
  ExportResult,
  ImportResult,
  InstalledModel,
  ModelInfo,
  OllamaEvent,
  OllamaStatus,
  ThemeMode,
  UnlockResult,
  VaultStatus,
  WhisperDownloadProgress,
  WhisperModelInfo,
  WhisperStatus
} from '@shared/ipc-contract'

const api: Api = {
  vault: {
    status: (): Promise<VaultStatus> => ipcRenderer.invoke('vault:status'),
    create: (pin: string): Promise<UnlockResult> => ipcRenderer.invoke('vault:create', pin),
    unlock: (pin: string): Promise<UnlockResult> => ipcRenderer.invoke('vault:unlock', pin),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    changePin: (currentPin, newPin) =>
      ipcRenderer.invoke('vault:change-pin', currentPin, newPin),
    setTouchIdEnabled: (enabled, pin) =>
      ipcRenderer.invoke('vault:set-touchid', enabled, pin),
    enableTouchIdCurrentSession: () =>
      ipcRenderer.invoke('vault:enable-touchid-current-session'),
    unlockWithTouchId: () => ipcRenderer.invoke('vault:unlock-touchid'),
    verifyPin: (pin: string) => ipcRenderer.invoke('vault:verify-pin', pin),
    promptTouchIdForAction: (reason: string) =>
      ipcRenderer.invoke('vault:prompt-touchid-action', reason),
    export: (): Promise<ExportResult> => ipcRenderer.invoke('vault:export'),
    pickImportFolder: (): Promise<string | null> =>
      ipcRenderer.invoke('vault:pick-import-folder'),
    import: (folder: string, pin: string): Promise<ImportResult> =>
      ipcRenderer.invoke('vault:import', folder, pin)
  },
  decisions: {
    list: (): Promise<Decision[]> => ipcRenderer.invoke('decisions:list'),
    search: (query: string): Promise<Decision[]> =>
      ipcRenderer.invoke('decisions:search', query),
    get: (id: string): Promise<Decision | null> => ipcRenderer.invoke('decisions:get', id),
    create: (input: DecisionCreateInput): Promise<Decision> =>
      ipcRenderer.invoke('decisions:create', input),
    update: (id: string, patch: DecisionUpdateInput): Promise<Decision> =>
      ipcRenderer.invoke('decisions:update', id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('decisions:delete', id)
  },
  theme: {
    get: (): Promise<ThemeMode> => ipcRenderer.invoke('theme:get'),
    set: (mode: ThemeMode): Promise<void> => ipcRenderer.invoke('theme:set', mode),
    onSystemChange: (cb) => {
      const listener = (_: unknown, isDark: boolean) => cb(isDark)
      ipcRenderer.on('theme:system-changed', listener)
      return () => ipcRenderer.removeListener('theme:system-changed', listener)
    }
  },
  app: {
    version: (): Promise<string> => ipcRenderer.invoke('app:version'),
    platform: (): Promise<string> => ipcRenderer.invoke('app:platform'),
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url)
  },
  transcription: {
    getStatus: (): Promise<WhisperStatus> => ipcRenderer.invoke('transcription:status'),
    listAvailableModels: (): Promise<WhisperModelInfo[]> =>
      ipcRenderer.invoke('transcription:available-models'),
    downloadModel: (name: string): Promise<void> =>
      ipcRenderer.invoke('transcription:download', name),
    cancelDownload: (): Promise<void> => ipcRenderer.invoke('transcription:cancel-download'),
    setActiveModel: (name: string): Promise<void> =>
      ipcRenderer.invoke('transcription:set-active', name),
    deleteModel: (name: string): Promise<void> =>
      ipcRenderer.invoke('transcription:delete', name),
    transcribe: (samples: ArrayBuffer): Promise<string> =>
      ipcRenderer.invoke('transcription:transcribe', samples),
    onDownloadProgress: (cb: (progress: WhisperDownloadProgress) => void) => {
      const listener = (_: unknown, progress: WhisperDownloadProgress) => cb(progress)
      ipcRenderer.on('whisper:download-progress', listener)
      return () => ipcRenderer.removeListener('whisper:download-progress', listener)
    }
  },
  ollama: {
    status: (): Promise<OllamaStatus> => ipcRenderer.invoke('ollama:status'),
    listInstalled: (): Promise<InstalledModel[]> => ipcRenderer.invoke('ollama:list-installed'),
    catalog: (): Promise<CatalogModel[]> => ipcRenderer.invoke('ollama:catalog'),
    pull: (modelId: string): Promise<string> => ipcRenderer.invoke('ollama:pull', modelId),
    cancel: (requestId: string): Promise<void> =>
      ipcRenderer.invoke('ollama:cancel', requestId),
    remove: (modelId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('ollama:remove', modelId),
    show: (modelId: string): Promise<ModelInfo | null> =>
      ipcRenderer.invoke('ollama:show', modelId),
    chat: (modelId: string, messages: ChatMsg[]): Promise<string> =>
      ipcRenderer.invoke('ollama:chat', modelId, messages),
    onEvent: (cb: (evt: OllamaEvent) => void) => {
      const listener = (_: unknown, evt: OllamaEvent) => cb(evt)
      ipcRenderer.on('ollama:event', listener)
      return () => ipcRenderer.removeListener('ollama:event', listener)
    },
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke('ollama:open-external', url)
  }
}

contextBridge.exposeInMainWorld('api', api)
