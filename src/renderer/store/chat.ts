import { create } from 'zustand'
import type {
  AiEvent,
  AiErrorCode,
  AiProvider,
  OnlineModel,
  OnlineSettings,
  StoredChatMessage
} from '@shared/ai'
import { DEFAULT_ONLINE_MODEL } from '@shared/ai'
import type {
  CatalogModel,
  ConversationSummary,
  InstalledModel,
  OllamaEvent,
  OllamaStatus
} from '@shared/ipc-contract'

export type Stage = 'loading' | 'setup' | 'chat'

/** Which panel the picker is showing. Starts on the two-option chooser. */
export type SetupView = 'chooser' | 'local' | 'online'

interface PullState {
  requestId: string
  modelId: string
  status: string
  completed: number
  total: number
  error: string | null
}

interface StreamingState {
  requestId: string
  partial: string
  error: string | null
  errorCode: AiErrorCode | null
  /** Set while waiting between retry attempts, so the delay is explained. */
  retry: { attempt: number; maxAttempts: number; waitMs: number; reason: string } | null
}

/** A message being rendered. Persisted messages carry an id; the optimistic
 * user turn does not until the next load. */
export type DisplayMessage = Omit<StoredChatMessage, 'id'> & { id: string | null }

interface ChatState {
  stage: Stage
  status: OllamaStatus | null
  catalog: CatalogModel[]
  installed: InstalledModel[]

  provider: AiProvider
  activeModel: string | null
  online: OnlineSettings | null
  onlineCatalog: OnlineModel[]
  setupView: SetupView
  /**
   * True only while the user is deliberately browsing the picker. Without this
   * the picker was sticky: once shown, `refresh()` kept returning to it even
   * after a provider became usable, so enabling online AI in Settings and
   * coming back to Chat still landed on the picker.
   */
  setupPinned: boolean

  messages: DisplayMessage[]
  streaming: StreamingState | null
  pulls: Record<string, PullState>
  initialized: boolean
  activeConversationId: string | null
  conversationList: ConversationSummary[]
  /** Decision ids this conversation is allowed to send. */
  attachments: string[]
  /** True once the user reviewed the disclosure for the current online thread. */
  onlineConsentConfirmed: boolean
  /** Between pressing send and the main process accepting the request. */
  sending: boolean
  /**
   * Whether this conversation sends approved memories.
   *
   * Defaults to on once the user has memory enabled and something approved.
   * It used to default off, which made the feature look broken: you would turn
   * memory on, watch it extract, then ask the coach what it knew and be told
   * "nothing". Turning extraction on is already the decision that memories
   * exist; making each conversation opt in again was a consent step the user
   * had no reason to expect. It stays switchable per conversation, and it is
   * always itemised in "What gets sent".
   */
  includeMemories: boolean
  /** True when there is at least one approved memory to send. */
  memoryAvailable: boolean

  init: () => Promise<void>
  refresh: () => Promise<void>
  refreshOnline: () => Promise<void>
  openModelSetup: () => void
  setSetupView: (view: SetupView) => void
  selectModel: (provider: AiProvider, modelId: string) => void
  setAttachments: (ids: string[]) => Promise<void>
  setIncludeMemories: (include: boolean) => void
  refreshMemoryAvailability: () => Promise<void>
  confirmOnlineConsent: () => void
  startPull: (modelId: string) => Promise<void>
  cancelPull: (modelId: string) => Promise<void>
  removeModel: (modelId: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  /** Re-sends the last user turn after a failure, without duplicating it. */
  retryLast: () => Promise<void>
  stopStreaming: () => Promise<void>
  clearConversation: () => void
  reset: () => void
  loadConversationList: () => Promise<void>
  loadConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
}

let ollamaDisposer: (() => void) | null = null
let aiDisposer: (() => void) | null = null

// ---------------- Event handling ----------------

function dispatchOllamaEvent(evt: OllamaEvent): void {
  // Only model pulls still come through this channel; chat moved to `ai:event`.
  const state = useChatStore.getState()
  const entry = Object.entries(state.pulls).find(([, p]) => p.requestId === evt.requestId)
  if (!entry) return
  const [modelId, existing] = entry
  handlePullEvent(modelId, existing, evt)
}

function handlePullEvent(modelId: string, existing: PullState, evt: OllamaEvent): void {
  if (evt.type === 'pull-progress') {
    useChatStore.setState((s) => ({
      pulls: {
        ...s.pulls,
        [modelId]: {
          ...existing,
          status: evt.status,
          completed: evt.completed ?? existing.completed,
          total: evt.total ?? existing.total
        }
      }
    }))
  } else if (evt.type === 'done' || evt.type === 'cancelled') {
    useChatStore.setState((s) => {
      const { [modelId]: _removed, ...rest } = s.pulls
      return { pulls: rest }
    })
    if (evt.type === 'done') void useChatStore.getState().refresh()
  } else if (evt.type === 'error') {
    useChatStore.setState((s) => ({
      pulls: { ...s.pulls, [modelId]: { ...existing, error: evt.message } }
    }))
  }
}

function dispatchAiEvent(evt: AiEvent): void {
  const state = useChatStore.getState()
  if (!state.streaming || state.streaming.requestId !== evt.requestId) return

  if (evt.type === 'token') {
    useChatStore.setState((s) =>
      s.streaming
        ? { streaming: { ...s.streaming, partial: s.streaming.partial + evt.token, retry: null } }
        : s
    )
    return
  }

  if (evt.type === 'retry') {
    useChatStore.setState((s) =>
      s.streaming
        ? {
            streaming: {
              ...s.streaming,
              retry: {
                attempt: evt.attempt,
                maxAttempts: evt.maxAttempts,
                waitMs: evt.waitMs,
                reason: evt.reason
              }
            }
          }
        : s
    )
    return
  }

  // The main process already persisted the assistant turn; the renderer only
  // needs to move the streamed text into the transcript.
  if (evt.type === 'done' || evt.type === 'cancelled') {
    useChatStore.setState((s) => {
      if (!s.streaming) return s
      const content = s.streaming.partial
      if (!content) return { streaming: null }
      const message: DisplayMessage = {
        id: null,
        role: 'assistant',
        content,
        createdAt: Date.now(),
        status: evt.type === 'cancelled' ? 'interrupted' : 'complete',
        provider: s.provider,
        modelId: (evt.type === 'done' ? evt.servedModel : null) ?? s.activeModel
      }
      return { messages: [...s.messages, message], streaming: null }
    })
    void useChatStore.getState().loadConversationList()
    return
  }

  if (evt.type === 'error') {
    useChatStore.setState((s) => {
      if (!s.streaming) return s
      const partial = s.streaming.partial
      const messages: DisplayMessage[] = partial
        ? [
            ...s.messages,
            {
              id: null,
              role: 'assistant' as const,
              content: partial,
              createdAt: Date.now(),
              status: 'error' as const,
              provider: s.provider,
              modelId: s.activeModel
            }
          ]
        : s.messages
      return {
        messages,
        streaming: {
          requestId: evt.requestId,
          partial: '',
          error: evt.message,
          errorCode: evt.code,
          retry: null
        }
      }
    })
  }
}

// ---------------- Store ----------------

function readyForChat(state: {
  provider: AiProvider
  activeModel: string | null
  online: OnlineSettings | null
}): boolean {
  if (!state.activeModel) return false
  if (state.provider === 'openrouter') {
    return state.online?.enabled === true && state.online.hasKey
  }
  return true
}

export const useChatStore = create<ChatState>((set, get) => ({
  stage: 'loading',
  status: null,
  catalog: [],
  installed: [],
  provider: 'ollama',
  activeModel: null,
  online: null,
  onlineCatalog: [],
  setupView: 'chooser',
  setupPinned: false,
  messages: [],
  streaming: null,
  pulls: {},
  initialized: false,
  activeConversationId: null,
  conversationList: [],
  attachments: [],
  onlineConsentConfirmed: false,
  includeMemories: false,
  memoryAvailable: false,
  sending: false,

  init: async () => {
    if (!get().initialized) {
      ollamaDisposer?.()
      aiDisposer?.()
      ollamaDisposer = window.api.ollama.onEvent(dispatchOllamaEvent)
      aiDisposer = window.api.ai.onEvent(dispatchAiEvent)
      set({ initialized: true })
    }
    // Arriving at Chat is never "browsing the picker" — re-evaluate freely.
    set({ setupPinned: false })
    await get().refreshMemoryAvailability()
    // Sequential, not parallel: refresh() decides which provider to land on and
    // needs the online settings that refreshOnline() fetches. Running them
    // together raced, and refresh() often read `online` as null.
    await get().refreshOnline()
    await get().refresh()
  },

  refreshMemoryAvailability: async () => {
    try {
      const memory = await window.api.memory.getSettings()
      const available = memory.enabled && memory.approvedCount > 0
      set((s) => ({
        memoryAvailable: available,
        // Adopt the default for a conversation that has not started yet.
        includeMemories:
          s.activeConversationId === null && s.messages.length === 0
            ? available
            : s.includeMemories
      }))
    } catch {
      set({ memoryAvailable: false })
    }
  },

  refreshOnline: async () => {
    try {
      const [online, catalog] = await Promise.all([
        window.api.ai.getSettings(),
        window.api.ai.catalog()
      ])
      set({ online, onlineCatalog: catalog.models })
    } catch {
      // leave previous state
    }
  },

  refresh: async () => {
    let status: OllamaStatus | null = null
    let catalog: CatalogModel[] = []
    let installed: InstalledModel[] = []
    try {
      status = await window.api.ollama.status()
      if (status.running) {
        ;[catalog, installed] = await Promise.all([
          window.api.ollama.catalog(),
          window.api.ollama.listInstalled()
        ])
      }
    } catch {
      status = {
        running: false,
        version: null,
        hardware: get().status?.hardware ?? { totalRamGB: 0, arch: 'other', cpuModel: 'Unknown' }
      }
    }

    const { provider, activeModel, online, setupPinned } = get()

    // Keep the current selection if it is still valid; otherwise fall back to
    // whichever provider is actually usable. Online availability no longer
    // depends on Ollama, and vice versa.
    let nextProvider = provider
    let nextModel = activeModel

    if (provider === 'ollama') {
      const stillValid = activeModel && installed.some((m) => m.id === activeModel)
      if (!stillValid) nextModel = installed.length > 0 ? installed[0].id : null
    }
    if (nextModel === null && online?.enabled && online.hasKey) {
      nextProvider = 'openrouter'
      nextModel = online.defaultModel || DEFAULT_ONLINE_MODEL
    }

    const ready = readyForChat({ provider: nextProvider, activeModel: nextModel, online })
    const stage: Stage = setupPinned ? 'setup' : ready ? 'chat' : 'setup'

    set({ status, catalog, installed, provider: nextProvider, activeModel: nextModel, stage })
  },

  openModelSetup: () => set({ stage: 'setup', setupView: 'chooser', setupPinned: true }),

  setSetupView: (view) => set({ setupView: view }),

  selectModel: (provider, modelId) => {
    set({
      provider,
      activeModel: modelId,
      messages: [],
      streaming: null,
      activeConversationId: null,
      attachments: [],
      onlineConsentConfirmed: false,
      includeMemories: false,
      stage: 'chat'
    })
  },

  setIncludeMemories: (include) => {
    // Turning this on widens what an online thread sends, so consent for this
    // thread has to be given again.
    const { provider, includeMemories } = get()
    set({
      includeMemories: include,
      onlineConsentConfirmed:
        provider === 'openrouter' && include && !includeMemories
          ? false
          : get().onlineConsentConfirmed
    })
  },

  setAttachments: async (ids) => {
    // Widening what a thread can send has to be re-confirmed before the next
    // online send.
    const { activeConversationId, attachments, provider } = get()
    const widened = ids.some((id) => !attachments.includes(id))
    set({
      attachments: ids,
      onlineConsentConfirmed:
        provider === 'openrouter' && widened ? false : get().onlineConsentConfirmed
    })
    if (activeConversationId) {
      try {
        await window.api.conversations.setAttachments(activeConversationId, { decisionIds: ids })
      } catch {
        // the next send re-sends the scope anyway
      }
    }
  },

  confirmOnlineConsent: () => set({ onlineConsentConfirmed: true }),

  startPull: async (modelId) => {
    const requestId = await window.api.ollama.pull(modelId)
    set((s) => ({
      pulls: {
        ...s.pulls,
        [modelId]: { requestId, modelId, status: 'starting', completed: 0, total: 0, error: null }
      }
    }))
  },

  cancelPull: async (modelId) => {
    const pull = get().pulls[modelId]
    if (pull) await window.api.ollama.cancel(pull.requestId)
  },

  removeModel: async (modelId) => {
    const res = await window.api.ollama.remove(modelId)
    if (res.ok) await get().refresh()
  },

  sendMessage: async (text) => {
    const {
      provider,
      activeModel,
      streaming,
      attachments,
      activeConversationId,
      onlineConsentConfirmed,
      includeMemories
    } = get()
    if (!activeModel || streaming) return
    const trimmed = text.trim()
    if (!trimmed) return

    const optimistic: DisplayMessage = {
      id: null,
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
      status: 'complete',
      provider: null,
      modelId: null
    }
    set((s) => ({ messages: [...s.messages, optimistic], sending: true }))

    let result: Awaited<ReturnType<typeof window.api.ai.send>>
    try {
      result = await window.api.ai.send({
        conversationId: activeConversationId,
        provider,
        modelId: activeModel,
        text: trimmed,
        attachments: { decisionIds: attachments },
        includeMemories,
        onlineConsentConfirmed: provider === 'ollama' ? true : onlineConsentConfirmed
      })
    } catch (err) {
      // Belt and braces. A rejected invoke() previously left the chat showing a
      // sent message with no indicator and no error — indistinguishable from a
      // hung request.
      result = {
        ok: false,
        code: 'internal',
        message: err instanceof Error ? err.message : 'The request could not be sent.'
      }
    }

    if (!result.ok) {
      // Keep the failed turn on screen rather than yanking it away.
      set({
        sending: false,
        streaming: {
          requestId: 'failed',
          partial: '',
          error: result.message,
          errorCode: result.code,
          retry: null
        }
      })
      return
    }

    set({
      sending: false,
      activeConversationId: result.conversationId,
      streaming: {
        requestId: result.requestId,
        partial: '',
        error: null,
        errorCode: null,
        retry: null
      }
    })
  },

  retryLast: async () => {
    const { messages, streaming } = get()
    if (streaming && !streaming.error) return
    // Find the last user turn and resend it. The failed assistant turn, if any,
    // was already persisted with an error status by the main process.
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    set({ streaming: null, messages: messages.filter((m) => m !== lastUser) })
    await get().sendMessage(lastUser.content)
  },

  stopStreaming: async () => {
    const { streaming } = get()
    if (!streaming) return
    await window.api.ai.cancel(streaming.requestId)
  },

  clearConversation: () => {
    set({
      messages: [],
      streaming: null,
      activeConversationId: null,
      attachments: [],
      onlineConsentConfirmed: false,
      sending: false,
      includeMemories: false
    })
    void get().loadConversationList()
  },

  reset: () => {
    ollamaDisposer?.()
    aiDisposer?.()
    ollamaDisposer = null
    aiDisposer = null
    set({
      stage: 'loading',
      status: null,
      catalog: [],
      installed: [],
      provider: 'ollama',
      activeModel: null,
      online: null,
      onlineCatalog: [],
      setupView: 'chooser',
      setupPinned: false,
      messages: [],
      streaming: null,
      pulls: {},
      initialized: false,
      activeConversationId: null,
      conversationList: [],
      attachments: [],
      onlineConsentConfirmed: false,
      includeMemories: false,
      memoryAvailable: false
    })
  },

  loadConversationList: async () => {
    try {
      set({ conversationList: await window.api.conversations.list() })
    } catch {
      // ignore
    }
  },

  loadConversation: async (id) => {
    try {
      const [meta, stored] = await Promise.all([
        window.api.conversations.get(id),
        window.api.conversations.messages(id)
      ])
      if (!meta) return
      const messages: DisplayMessage[] = stored.map((m) => ({ ...m, id: m.id }))
      set({
        messages,
        activeConversationId: id,
        streaming: null,
        // Restore the thread's own provider and model rather than leaving
        // whatever was last selected — a reopened chat must not silently switch
        // providers.
        provider: meta.provider,
        activeModel: meta.modelId,
        attachments: meta.attachments.decisionIds,
        onlineConsentConfirmed: meta.onlineConsentGiven,
        includeMemories: meta.includeMemories,
        stage: 'chat'
      })
    } catch {
      // ignore
    }
  },

  deleteConversation: async (id) => {
    try {
      await window.api.conversations.delete(id)
      if (get().activeConversationId === id) {
        set({
          messages: [],
          streaming: null,
          activeConversationId: null,
          attachments: [],
          onlineConsentConfirmed: false,
          includeMemories: false
        })
      }
      await get().loadConversationList()
    } catch {
      // ignore
    }
  }
}))
