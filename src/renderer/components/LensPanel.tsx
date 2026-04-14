import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Sparkles } from 'lucide-react'
import {
  LENS_DESCRIPTIONS,
  LENS_KINDS,
  LENS_LABELS,
  type LensKind
} from '@shared/ipc-contract'
import { useChatStore } from '../store/chat'

export default function LensPanel({ decisionId }: { decisionId: string }) {
  const navigate = useNavigate()
  const activeModel = useChatStore((s) => s.activeModel)
  const chatStage = useChatStore((s) => s.stage)
  const chatInit = useChatStore((s) => s.init)
  const chatInitialized = useChatStore((s) => s.initialized)

  const [launching, setLaunching] = useState<LensKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chatInitialized) {
      void chatInit()
    }
  }, [chatInit, chatInitialized])

  const runLens = useCallback(
    async (kind: LensKind) => {
      if (launching) return
      if (!activeModel) {
        setError('Pick a model in the Chat tab first.')
        return
      }
      setError(null)
      setLaunching(kind)
      try {
        const seed = await window.api.lenses.prepareConversation(decisionId, kind)
        const conv = await window.api.conversations.create(activeModel, seed.title)
        const store = useChatStore.getState()
        await store.loadConversation(conv.id)
        await store.loadConversationList()
        await store.sendMessage(seed.firstMessage)
        navigate('/chat')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start lens')
        setLaunching(null)
      }
    },
    [activeModel, decisionId, launching, navigate]
  )

  const modelReady = chatStage === 'chat' && activeModel !== null
  const disabled = !modelReady || launching !== null

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
          <Sparkles size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[18px] font-medium text-text">Analyze with a lens</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
            Pick a lens and we'll start a new Chat conversation pre-loaded with this decision
            and a focused prompt. You can read the response with full markdown and follow up.
          </p>
        </div>
      </div>

      {!modelReady && (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-bg/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-text-muted">
          {chatStage === 'not-installed'
            ? 'Ollama is not running. Open the Chat tab to install or start it, then come back.'
            : chatStage === 'setup'
              ? 'No Ollama model selected yet. Open the Chat tab and pick one, then come back.'
              : 'Loading Ollama state…'}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LENS_KINDS.map((kind) => {
          const isLaunching = launching === kind
          return (
            <button
              key={kind}
              type="button"
              onClick={() => runLens(kind)}
              disabled={disabled}
              className="flex flex-col items-start gap-0.5 rounded-xl border border-border bg-bg px-3.5 py-3 text-left transition-colors hover:border-text/30 hover:bg-nav-active disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-text">
                {isLaunching && <Loader2 size={12} className="animate-spin" />}
                {LENS_LABELS[kind]}
              </span>
              <span className="text-[11.5px] leading-snug text-text-muted">
                {LENS_DESCRIPTIONS[kind]}
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-red-500/90">{error}</p>
      )}
    </div>
  )
}
