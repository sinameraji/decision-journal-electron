import { contextBridge, ipcRenderer } from 'electron'
import type {
  Api,
  CatalogModel,
  ConversationSummary,
  Decision,
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
  UpdateStatus,
  VaultStatus,
  WhisperDownloadProgress,
  WhisperModelInfo,
  WhisperStatus
} from '@shared/ipc-contract'
import type {
  AiEvent,
  AttachmentScope,
  ConversationMeta,
  OnlineCatalog,
  OnlineSettings,
  SendChatParams,
  SendChatResult,
  StoredChatMessage
} from '@shared/ai'
import type {
  MemoryActionResult,
  MemoryBackfillEstimate,
  MemoryCategory,
  MemoryItem,
  MemoryJob,
  MemorySettings,
  MemoryState
} from '@shared/memory'
import type {
  BorrowedFramework,
  RoleModel,
  RoleModelResult,
  RoleModelSettings
} from '@shared/roleModels'

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
      ipcRenderer.invoke('vault:import', folder, pin),
    replaceFromBackup: (folder: string, pin: string): Promise<ReplaceFromBackupResult> =>
      ipcRenderer.invoke('vault:replace-from-backup', folder, pin)
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
    review: (id: string, input: DecisionReviewInput): Promise<Decision> =>
      ipcRenderer.invoke('decisions:review', id, input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('decisions:delete', id),
    setMemoryExcluded: (id: string, excluded: boolean): Promise<void> =>
      ipcRenderer.invoke('decisions:set-memory-excluded', id, excluded)
  },
  conversations: {
    list: (): Promise<ConversationSummary[]> => ipcRenderer.invoke('conversations:list'),
    get: (id: string): Promise<ConversationMeta | null> =>
      ipcRenderer.invoke('conversations:get', id),
    messages: (id: string): Promise<StoredChatMessage[]> =>
      ipcRenderer.invoke('conversations:messages', id),
    setAttachments: (id: string, attachments: AttachmentScope): Promise<void> =>
      ipcRenderer.invoke('conversations:set-attachments', id, attachments),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('conversations:delete', id)
  },
  memory: {
    getSettings: (): Promise<MemorySettings> => ipcRenderer.invoke('memory:get-settings'),
    setEnabled: (enabled: boolean): Promise<MemorySettings> =>
      ipcRenderer.invoke('memory:set-enabled', enabled),
    setModel: (modelId: string): Promise<MemorySettings> =>
      ipcRenderer.invoke('memory:set-model', modelId),
    list: (states?: MemoryState[]): Promise<MemoryItem[]> =>
      ipcRenderer.invoke('memory:list', states),
    jobs: (): Promise<MemoryJob[]> => ipcRenderer.invoke('memory:jobs'),
    approve: (id: string): Promise<MemoryActionResult> =>
      ipcRenderer.invoke('memory:approve', id),
    reject: (id: string): Promise<MemoryActionResult> => ipcRenderer.invoke('memory:reject', id),
    delete: (id: string): Promise<MemoryActionResult> => ipcRenderer.invoke('memory:delete', id),
    updateStatement: (id: string, statement: string): Promise<MemoryActionResult> =>
      ipcRenderer.invoke('memory:update-statement', id, statement),
    answer: (id: string, text: string): Promise<MemoryActionResult> =>
      ipcRenderer.invoke('memory:answer', id, text),
    add: (category: MemoryCategory, statement: string): Promise<MemoryActionResult> =>
      ipcRenderer.invoke('memory:add', category, statement),
    forgetAll: (): Promise<MemoryActionResult> => ipcRenderer.invoke('memory:forget-all'),
    estimateBackfill: (decisionIds: string[]): Promise<MemoryBackfillEstimate> =>
      ipcRenderer.invoke('memory:estimate-backfill', decisionIds),
    runBackfill: (decisionIds: string[]): Promise<MemoryActionResult> =>
      ipcRenderer.invoke('memory:run-backfill', decisionIds),
    onChanged: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('memory:changed', listener)
      return () => ipcRenderer.removeListener('memory:changed', listener)
    }
  },
  roleModels: {
    getSettings: (): Promise<RoleModelSettings> => ipcRenderer.invoke('rolemodels:get-settings'),
    setEnabled: (enabled: boolean): Promise<RoleModelSettings> =>
      ipcRenderer.invoke('rolemodels:set-enabled', enabled),
    setModel: (modelId: string): Promise<RoleModelSettings> =>
      ipcRenderer.invoke('rolemodels:set-model', modelId),
    list: (): Promise<RoleModel[]> => ipcRenderer.invoke('rolemodels:list'),
    add: (query: string): Promise<RoleModelResult> => ipcRenderer.invoke('rolemodels:add', query),
    confirm: (id: string, name: string): Promise<RoleModelResult> =>
      ipcRenderer.invoke('rolemodels:confirm', id, name),
    reject: (id: string, hint: string): Promise<RoleModelResult> =>
      ipcRenderer.invoke('rolemodels:reject', id, hint),
    rebuild: (id: string): Promise<RoleModelResult> => ipcRenderer.invoke('rolemodels:rebuild', id),
    retry: (id: string): Promise<RoleModelResult> => ipcRenderer.invoke('rolemodels:retry', id),
    addSource: (id: string, url: string): Promise<RoleModelResult> =>
      ipcRenderer.invoke('rolemodels:add-source', id, url),
    remove: (id: string): Promise<RoleModelResult> => ipcRenderer.invoke('rolemodels:remove', id),
    setFrameworkEnabled: (frameworkId: string, enabled: boolean): Promise<RoleModelResult> =>
      ipcRenderer.invoke('rolemodels:set-framework-enabled', frameworkId, enabled),
    frameworks: (): Promise<BorrowedFramework[]> => ipcRenderer.invoke('rolemodels:frameworks'),
    openSource: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('rolemodels:open-source', url),
    onChanged: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('rolemodels:changed', listener)
      return () => ipcRenderer.removeListener('rolemodels:changed', listener)
    }
  },
  ai: {
    getSettings: (): Promise<OnlineSettings> => ipcRenderer.invoke('ai:get-settings'),
    setEnabled: (enabled: boolean): Promise<OnlineSettings> =>
      ipcRenderer.invoke('ai:set-enabled', enabled),
    setApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('ai:set-api-key', key),
    clearApiKey: (): Promise<OnlineSettings> => ipcRenderer.invoke('ai:clear-api-key'),
    setDefaultModel: (modelId: string): Promise<OnlineSettings> =>
      ipcRenderer.invoke('ai:set-default-model', modelId),
    catalog: (): Promise<OnlineCatalog> => ipcRenderer.invoke('ai:catalog'),
    getLastModel: (): Promise<{ provider: string; modelId: string } | null> =>
      ipcRenderer.invoke('ai:get-last-model'),
    setLastModel: (provider: string, modelId: string): Promise<void> =>
      ipcRenderer.invoke('ai:set-last-model', provider, modelId),
    acknowledgeNonZdr: (modelId: string): Promise<OnlineSettings> =>
      ipcRenderer.invoke('ai:acknowledge-non-zdr', modelId),
    refreshCatalog: () => ipcRenderer.invoke('ai:refresh-catalog'),
    preview: (params) => ipcRenderer.invoke('ai:preview', params),
    send: (params: SendChatParams): Promise<SendChatResult> =>
      ipcRenderer.invoke('ai:send', params),
    cancel: (requestId: string): Promise<void> => ipcRenderer.invoke('ai:cancel', requestId),
    onEvent: (cb: (evt: AiEvent) => void) => {
      const listener = (_: unknown, evt: AiEvent) => cb(evt)
      ipcRenderer.on('ai:event', listener)
      return () => ipcRenderer.removeListener('ai:event', listener)
    }
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
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    checkForUpdates: (): Promise<void> => ipcRenderer.invoke('app:check-for-updates'),
    downloadUpdate: (): Promise<void> => ipcRenderer.invoke('app:download-update'),
    installUpdate: (): Promise<void> => ipcRenderer.invoke('app:install-update'),
    getAutoUpdateEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke('app:get-auto-update-enabled'),
    setAutoUpdateEnabled: (enabled: boolean): Promise<void> =>
      ipcRenderer.invoke('app:set-auto-update-enabled', enabled),
    onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
      const listener = (_: unknown, status: UpdateStatus) => cb(status)
      ipcRenderer.on('app:update-status', listener)
      return () => ipcRenderer.removeListener('app:update-status', listener)
    }
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
