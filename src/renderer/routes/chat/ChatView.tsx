import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Square, Eraser, AlertCircle, Sparkles, X, FileText } from 'lucide-react'
import {
  LENS_LABELS,
  type Decision,
  type LensKind
} from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'
import MicButton from '../../components/voice/MicButton'
import Message from './Message'
import PastChatsDropdown from './PastChatsDropdown'
import LensSlashPopover, { filterLenses } from './LensSlashPopover'
import DecisionAtPopover, { filterDecisions } from './DecisionAtPopover'

export default function ChatView() {
  const activeModel = useChatStore((s) => s.activeModel)
  const catalog = useChatStore((s) => s.catalog)
  const installed = useChatStore((s) => s.installed)
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const openModelSetup = useChatStore((s) => s.openModelSetup)
  const clearConversation = useChatStore((s) => s.clearConversation)

  const [input, setInput] = useState('')
  const [armedLens, setArmedLens] = useState<LensKind | null>(null)
  const [armedDecision, setArmedDecision] = useState<{ id: string; title: string } | null>(
    null
  )
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const [activePopoverIndex, setActivePopoverIndex] = useState(0)
  const [allDecisionsForAt, setAllDecisionsForAt] = useState<Decision[] | null>(null)
  const [launching, setLaunching] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const catalogEntry = catalog.find((m) => m.id === activeModel)
  const installedEntry = installed.find((m) => m.id === activeModel)
  const displayLabel = catalogEntry?.label ?? activeModel ?? ''
  const displayParams = catalogEntry?.paramCount ?? installedEntry?.parameterSize ?? ''
  const displaySizeGB = catalogEntry?.sizeGB
    ? `${catalogEntry.sizeGB} GB`
    : installedEntry
      ? `${(installedEntry.sizeBytes / 1024 ** 3).toFixed(1)} GB`
      : ''

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming?.partial])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeModel])

  const slashOpen = slashQuery !== null && armedLens === null
  const atOpen = atQuery !== null && armedLens !== null && armedDecision === null

  const slashResults = useMemo(
    () => (slashOpen && slashQuery !== null ? filterLenses(slashQuery) : []),
    [slashOpen, slashQuery]
  )
  const atResults = useMemo(
    () =>
      atOpen && atQuery !== null && allDecisionsForAt
        ? filterDecisions(allDecisionsForAt, atQuery)
        : [],
    [atOpen, atQuery, allDecisionsForAt]
  )

  useEffect(() => {
    setActivePopoverIndex(0)
  }, [slashOpen, atOpen, slashQuery, atQuery])

  useEffect(() => {
    if (!atOpen || allDecisionsForAt !== null) return
    let cancelled = false
    window.api.decisions.list().then((rows) => {
      if (!cancelled) setAllDecisionsForAt(rows)
    })
    return () => {
      cancelled = true
    }
  }, [atOpen, allDecisionsForAt])

  function parseForPopovers(nextInput: string): void {
    // Slash lens picker: "/" at start, no lens armed yet
    if (armedLens === null && nextInput.startsWith('/')) {
      const rest = nextInput.slice(1)
      // Close when a space is typed after the slash word
      if (/\s/.test(rest)) {
        setSlashQuery(null)
      } else {
        setSlashQuery(rest)
      }
      return
    }
    // @-decision picker: lens armed, no decision yet, last '@' in text
    if (armedLens !== null && armedDecision === null) {
      const atIdx = nextInput.lastIndexOf('@')
      if (atIdx >= 0 && !/\s/.test(nextInput.slice(atIdx + 1))) {
        setAtQuery(nextInput.slice(atIdx + 1))
        return
      }
    }
    setSlashQuery(null)
    setAtQuery(null)
  }

  function handleInputChange(value: string): void {
    setInput(value)
    parseForPopovers(value)
  }

  function selectLens(kind: LensKind): void {
    setArmedLens(kind)
    setInput('')
    setSlashQuery(null)
    setActivePopoverIndex(0)
    textareaRef.current?.focus()
  }

  function selectDecision(decision: Decision): void {
    setArmedDecision({ id: decision.id, title: decision.title })
    setInput('')
    setAtQuery(null)
    setActivePopoverIndex(0)
    textareaRef.current?.focus()
  }

  function clearArmed(): void {
    setArmedLens(null)
    setArmedDecision(null)
    setSlashQuery(null)
    setAtQuery(null)
  }

  async function launchArmedLens(): Promise<void> {
    if (!armedLens || !armedDecision || !activeModel || launching || streaming) return
    setLaunching(true)
    try {
      const seed = await window.api.lenses.prepareConversation(
        armedDecision.id,
        armedLens
      )
      const conv = await window.api.conversations.create(activeModel, seed.title)
      const store = useChatStore.getState()
      await store.loadConversation(conv.id)
      await store.loadConversationList()
      clearArmed()
      setInput('')
      await store.sendMessage(seed.firstMessage)
    } catch (err) {
      console.error('lens launch failed', err)
    } finally {
      setLaunching(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActivePopoverIndex((i) => Math.min(i + 1, Math.max(slashResults.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActivePopoverIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const pick = slashResults[activePopoverIndex]
        if (pick) selectLens(pick)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInput('')
        setSlashQuery(null)
        return
      }
    }
    if (atOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActivePopoverIndex((i) => Math.min(i + 1, Math.max(atResults.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActivePopoverIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const pick = atResults[activePopoverIndex]
        if (pick) selectDecision(pick)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInput('')
        setAtQuery(null)
        return
      }
    }
    if (e.key === 'Escape' && (armedLens || armedDecision)) {
      e.preventDefault()
      clearArmed()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (armedLens && armedDecision) {
        void launchArmedLens()
      } else {
        void handleSend()
      }
    }
  }

  async function handleSend(): Promise<void> {
    if (!input.trim() || streaming) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  const handleMicInsert = useCallback(
    (text: string) => {
      const el = textareaRef.current
      if (el && el === document.activeElement) {
        const start = el.selectionStart ?? input.length
        const end = el.selectionEnd ?? input.length
        setInput(input.slice(0, start) + text + input.slice(end))
      } else {
        setInput(input ? input + ' ' + text : text)
      }
    },
    [input]
  )

  if (!activeModel) return null

  return (
    <div className="mx-auto flex h-full max-w-[780px] flex-col">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={openModelSetup}
            className="group inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
          >
            <span className="font-serif text-[18px] font-medium text-text">
              {displayLabel}
            </span>
            <ChevronDown size={14} strokeWidth={2} className="opacity-60" />
          </button>
          <div className="mt-0.5 text-[11px] text-text-muted">
            Running locally{displayParams ? ` · ${displayParams}` : ''}
            {displaySizeGB ? ` · ${displaySizeGB}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PastChatsDropdown />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text"
            >
              <Eraser size={12} strokeWidth={2} />
              New chat
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !streaming ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <Message key={i} message={m} />
            ))}
            {streaming && streaming.partial && (
              <Message message={{ role: 'assistant', content: streaming.partial }} streaming />
            )}
            {streaming && !streaming.partial && !streaming.error && <TypingIndicator />}
            {streaming?.error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-[12.5px] text-red-600 dark:text-red-400">
                <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                <span>{streaming.error}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 pb-4">
        <div className="relative">
          {slashOpen && (
            <LensSlashPopover
              query={slashQuery ?? ''}
              activeIndex={activePopoverIndex}
              onHoverIndex={setActivePopoverIndex}
              onSelect={selectLens}
            />
          )}
          {atOpen && (
            <DecisionAtPopover
              decisions={allDecisionsForAt}
              results={atResults}
              query={atQuery ?? ''}
              activeIndex={activePopoverIndex}
              onHoverIndex={setActivePopoverIndex}
              onSelect={selectDecision}
            />
          )}

          {(armedLens || armedDecision) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {armedLens && (
                <Pill
                  icon={<Sparkles size={11} strokeWidth={2} />}
                  label={LENS_LABELS[armedLens]}
                  onRemove={() => {
                    setArmedLens(null)
                    setArmedDecision(null)
                  }}
                />
              )}
              {armedDecision && (
                <Pill
                  icon={<FileText size={11} strokeWidth={2} />}
                  label={armedDecision.title || '(untitled)'}
                  onRemove={() => setArmedDecision(null)}
                />
              )}
              {armedLens && !armedDecision && (
                <span className="text-[11.5px] text-text-muted">
                  type <kbd className="rounded bg-bg px-1 py-0.5 font-mono text-[10.5px]">@</kbd>{' '}
                  to pick a decision
                </span>
              )}
              {armedLens && armedDecision && (
                <span className="text-[11.5px] text-text-muted">
                  press <kbd className="rounded bg-bg px-1 py-0.5 font-mono text-[10.5px]">↵</kbd>{' '}
                  to run the lens
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                armedLens && !armedDecision
                  ? 'type @ to pick a decision…'
                  : armedLens && armedDecision
                    ? 'press enter to run the lens'
                    : 'Ask about a decision, or type / for a lens…'
              }
              rows={1}
              className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-text placeholder:text-text-muted focus:outline-none"
              disabled={!!streaming || launching}
            />
            {!streaming && !armedLens && <MicButton onInsert={handleMicInsert} />}
            {streaming ? (
              <button
                type="button"
                onClick={stopStreaming}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text hover:text-red-500"
                aria-label="Stop"
              >
                <Square size={13} strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (armedLens && armedDecision) void launchArmedLens()
                  else void handleSend()
                }}
                disabled={
                  armedLens
                    ? !armedDecision || launching
                    : !input.trim()
                }
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
                aria-label={armedLens ? 'Run lens' : 'Send'}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 text-center text-[10.5px] text-text-muted/80">
          Messages and replies stay on this Mac · type{' '}
          <kbd className="rounded bg-bg px-1 py-0.5 font-mono text-[10px]">/</kbd> for a lens.
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  const suggestions = [
    'What patterns do you see in my recent decisions?',
    'Help me think through my most recent decision.',
    'What questions should I be asking myself right now?'
  ]
  const sendMessage = useChatStore((s) => s.sendMessage)
  return (
    <div className="mt-10 flex flex-col items-center">
      <div className="font-serif text-[22px] font-medium text-text">How can I help?</div>
      <p className="mt-1 text-[12.5px] text-text-muted">
        I can see your recent decisions. Try one of these:
      </p>
      <div className="mt-5 flex w-full max-w-[520px] flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => sendMessage(s)}
            className="rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-left text-[12.5px] text-text hover:bg-nav-active"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Pill({
  icon,
  label,
  onRemove
}: {
  icon: React.ReactNode
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex max-w-[320px] items-center gap-1.5 rounded-full border border-[rgb(var(--accent))] bg-[rgb(var(--accent))]/10 px-2.5 py-1 text-[11.5px] text-text dark:border-text/30 dark:bg-text/5">
      <span className="text-text-muted">{icon}</span>
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-nav-active hover:text-text"
      >
        <X size={10} strokeWidth={2.5} />
      </button>
    </span>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md border border-border bg-bg-elevated px-4 py-2.5">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted" />
        </div>
      </div>
    </div>
  )
}
