import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ArrowUp,
  Eraser,
  Eye,
  Brain,
  Globe,
  Laptop,
  Paperclip,
  Sparkles,
  Square,
  X
} from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'
import { LENS_LABELS, LENS_OPENERS, type LensKind } from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'
import MicButton from '../../components/voice/MicButton'
import Message from './Message'
import PastChatsDropdown from './PastChatsDropdown'
import AttachDecisionsModal from './AttachDecisionsModal'
import SendReviewModal from './SendReviewModal'
import ModelSwitcher from './ModelSwitcher'
import LensSlashPopover, { filterLenses } from './LensSlashPopover'
import DecisionAtPopover, { filterDecisions } from './DecisionAtPopover'

export default function ChatView() {
  const provider = useChatStore((s) => s.provider)
  const activeModel = useChatStore((s) => s.activeModel)
  const catalog = useChatStore((s) => s.catalog)
  const installed = useChatStore((s) => s.installed)
  const onlineCatalog = useChatStore((s) => s.onlineCatalog)
  const messages = useChatStore((s) => s.messages)
  const streaming = useChatStore((s) => s.streaming)
  const sending = useChatStore((s) => s.sending)
  const attachments = useChatStore((s) => s.attachments)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const onlineConsentConfirmed = useChatStore((s) => s.onlineConsentConfirmed)
  const includeMemories = useChatStore((s) => s.includeMemories)
  const setIncludeMemories = useChatStore((s) => s.setIncludeMemories)
  const memoryAvailable = useChatStore((s) => s.memoryAvailable)
  const lens = useChatStore((s) => s.lens)
  const setLens = useChatStore((s) => s.setLens)

  // `/` picks a lens, `@` picks the decision it applies to. The picker only
  // sets the attachment scope — it never pastes journal text into the message,
  // so "What gets sent" stays accurate.
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [atQuery, setAtQuery] = useState<string | null>(null)
  const [popoverIndex, setPopoverIndex] = useState(0)
  const [allDecisions, setAllDecisions] = useState<Decision[]>([])

  useEffect(() => {
    void window.api.decisions.list().then(setAllDecisions).catch(() => setAllDecisions([]))
  }, [])

  const lensResults = slashQuery === null ? [] : filterLenses(slashQuery)
  const atResults = atQuery === null ? [] : filterDecisions(allDecisions, atQuery)
  const popoverOpen = slashQuery !== null || atQuery !== null

  function closePopovers() {
    setSlashQuery(null)
    setAtQuery(null)
    setPopoverIndex(0)
  }

  function onInputChange(value: string) {
    setInput(value)
    // `/` only opens at the very start of an empty-ish input; `@` any time.
    if (value.startsWith('/') && !value.includes(' ')) {
      setSlashQuery(value.slice(1))
      setAtQuery(null)
      setPopoverIndex(0)
      return
    }
    const at = value.lastIndexOf('@')
    if (at !== -1 && !value.slice(at + 1).includes(' ')) {
      setAtQuery(value.slice(at + 1))
      setSlashQuery(null)
      setPopoverIndex(0)
      return
    }
    closePopovers()
  }

  function pickLens(kind: LensKind) {
    setLens(kind)
    setInput('')
    closePopovers()
    textareaRef.current?.focus()
  }

  function pickDecision(d: Decision) {
    if (!attachments.includes(d.id)) void setAttachments([...attachments, d.id])
    const at = input.lastIndexOf('@')
    setInput(at === -1 ? input : input.slice(0, at))
    closePopovers()
    textareaRef.current?.focus()
  }
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const clearConversation = useChatStore((s) => s.clearConversation)
  const retryLast = useChatStore((s) => s.retryLast)
  const openModelSetup = useChatStore((s) => s.openModelSetup)
  const setAttachments = useChatStore((s) => s.setAttachments)
  const confirmOnlineConsent = useChatStore((s) => s.confirmOnlineConsent)

  const [input, setInput] = useState('')
  const [showAttach, setShowAttach] = useState(false)
  const [review, setReview] = useState<'consent' | 'preview' | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const online = provider === 'openrouter'
  const onlineModel = onlineCatalog.find((m) => m.id === activeModel)
  const catalogEntry = catalog.find((m) => m.id === activeModel)
  const installedEntry = installed.find((m) => m.id === activeModel)

  const displayLabel = online
    ? (onlineModel?.name ?? activeModel ?? '')
    : (catalogEntry?.label ?? activeModel ?? '')

  const subtitle = online
    ? `Online · OpenRouter${onlineModel ? ` · ${onlineModel.id}` : ''}`
    : `Running locally${catalogEntry?.paramCount ? ` · ${catalogEntry.paramCount}` : installedEntry?.parameterSize ? ` · ${installedEntry.parameterSize}` : ''}`

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming?.partial])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [activeModel])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (popoverOpen) {
      const results = slashQuery !== null ? lensResults : atResults
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPopoverIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPopoverIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closePopovers()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && results.length > 0) {
        e.preventDefault()
        if (slashQuery !== null) pickLens(lensResults[popoverIndex])
        else pickDecision(atResults[popoverIndex])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // With a lens armed over an attached decision there is nothing to type — the
  // lens is the instruction — so an empty composer is a valid request.
  const lensRunReady = lens !== null && attachments.length > 0
  const canSend = input.trim().length > 0 || lensRunReady

  async function handleSend() {
    if (!canSend || streaming || sending) return
    // The first online turn in a thread, and any turn after the attachment
    // scope widened, has to pass through the disclosure first.
    if (online && !onlineConsentConfirmed) {
      setReview('consent')
      return
    }
    const text = input.trim() || (lens ? LENS_OPENERS[lens] : '')
    setInput('')
    await sendMessage(text)
  }

  async function handleConfirmedSend() {
    confirmOnlineConsent()
    setReview(null)
    const text = input.trim() || (lens ? LENS_OPENERS[lens] : '')
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
          <ModelSwitcher label={displayLabel} />
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
            {online ? (
              <Globe size={10} strokeWidth={2} className="text-amber-600 dark:text-amber-400" />
            ) : (
              <Laptop size={10} strokeWidth={2} />
            )}
            <span className="truncate">{subtitle}</span>
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

      <div className="flex items-center gap-2 border-b border-border py-2">
        <button
          type="button"
          onClick={() => setShowAttach(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text"
        >
          <Paperclip size={12} strokeWidth={2} />
          {attachments.length === 0
            ? 'Attach decisions'
            : `${attachments.length} decision${attachments.length === 1 ? '' : 's'} attached`}
        </button>
        {memoryAvailable && (
          <button
            type="button"
            onClick={() => setIncludeMemories(!includeMemories)}
            aria-pressed={includeMemories}
            className={[
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px]',
              includeMemories
                ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text dark:border-border dark:bg-bg-elevated dark:text-text'
                : 'border-border bg-bg text-text-muted hover:text-text'
            ].join(' ')}
            title={
              includeMemories
                ? 'Your approved memories are sent with this conversation'
                : 'This conversation is not sending your approved memories'
            }
          >
            <Brain size={12} strokeWidth={2} />
            {includeMemories ? 'Using memories' : 'Memories off for this chat'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setReview('preview')}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text"
        >
          <Eye size={12} strokeWidth={2} />
          What gets sent
        </button>
        {online && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-[10.5px] text-amber-700 dark:text-amber-400">
            <Globe size={10} strokeWidth={2} />
            Leaves your Mac
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !streaming && !sending ? (
          <EmptyState
            online={online}
            lensReady={lensRunReady ? LENS_LABELS[lens] : null}
            onAttach={() => setShowAttach(true)}
            onRun={handleSend}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <Message key={m.id ?? `local-${i}`} message={m} />
            ))}
            {streaming && streaming.partial && (
              <Message message={{ role: 'assistant', content: streaming.partial }} streaming />
            )}
            {(sending || (streaming && !streaming.partial && !streaming.error)) && (
              <TypingIndicator />
            )}
            {streaming?.retry && <RetryBanner retry={streaming.retry} />}
            {streaming?.error && (
              <ErrorPanel
                message={streaming.error}
                code={streaming.errorCode}
                onRetry={() => void retryLast()}
                onPickModel={openModelSetup}
              />
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pb-4 pt-3">
        {lens && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-2.5 py-1 text-[11.5px] font-medium text-accent-text dark:border-border dark:bg-bg-elevated dark:text-text">
              <Sparkles size={11} strokeWidth={2} />
              {LENS_LABELS[lens]}
              <button
                type="button"
                onClick={() => setLens(null)}
                aria-label="Remove lens"
                className="ml-0.5 opacity-70 hover:opacity-100"
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </span>
            {attachments.length === 0 && (
              <span className="text-[11px] text-text-muted">
                Type <span className="font-mono">@</span> to pick the decision it applies to
              </span>
            )}
          </div>
        )}

        <div className="relative flex items-end gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2">
          {slashQuery !== null && (
            <LensSlashPopover
              query={slashQuery}
              activeIndex={popoverIndex}
              onHoverIndex={setPopoverIndex}
              onSelect={pickLens}
            />
          )}
          {atQuery !== null && (
            <DecisionAtPopover
              decisions={allDecisions}
              results={atResults}
              query={atQuery}
              activeIndex={popoverIndex}
              onHoverIndex={setPopoverIndex}
              onSelect={pickDecision}
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              lensRunReady
                ? `Press ⏎ to run ${LENS_LABELS[lens]} — or add a question first…`
                : lens
                  ? 'Type @ to pick the decision this lens applies to…'
                  : 'Ask anything — / for a lens, @ to attach a decision…'
            }
            rows={1}
            className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-text placeholder:text-text-muted focus:outline-none"
            disabled={!!streaming || sending}
          />
          {!streaming && <MicButton onInsert={handleMicInsert} />}
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
              onClick={handleSend}
              disabled={!canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
              aria-label="Send"
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
        <div className="mt-1.5 text-center text-[10.5px] text-text-muted/80">
          {online
            ? 'This chat and the decisions you attach are sent to OpenRouter and the model provider. Nothing else from your journal is.'
            : 'Messages and replies stay on this Mac. The model sees the decisions you attach, plus titles of your recent ones.'}
        </div>
      </div>

      {showAttach && (
        <AttachDecisionsModal
          selected={attachments}
          onClose={() => setShowAttach(false)}
          onSave={(ids) => {
            void setAttachments(ids)
            setShowAttach(false)
          }}
        />
      )}

      {review && (
        <SendReviewModal
          provider={provider}
          modelId={activeModel}
          conversationId={activeConversationId}
          attachments={attachments}
          includeMemories={includeMemories}
          lens={lens}
          pendingText={input}
          onConfirm={review === 'consent' ? handleConfirmedSend : null}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  )
}

function EmptyState({
  online,
  lensReady,
  onAttach,
  onRun
}: {
  online: boolean
  lensReady: string | null
  onAttach: () => void
  onRun: () => void
}) {
  const suggestions = [
    'What patterns do you see in the decisions I attached?',
    'Help me think through my most recent decision.',
    'What questions should I be asking myself right now?'
  ]
  const sendMessage = useChatStore((s) => s.sendMessage)
  const onlineConsentConfirmed = useChatStore((s) => s.onlineConsentConfirmed)
  const canQuickSend = !online || onlineConsentConfirmed

  if (lensReady) {
    return (
      <div className="mt-16 flex flex-col items-center">
        <div className="font-serif text-[22px] font-medium text-text">Ready to run</div>
        <p className="mt-1 max-w-[420px] text-center text-[12.5px] text-text-muted">
          {lensReady} over the decision you attached. Send it as is, or add a question of your own
          first.
        </p>
        <button
          type="button"
          onClick={onRun}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-4 py-2.5 text-[13px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
        >
          <Sparkles size={14} strokeWidth={2} />
          Run {lensReady}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-10 flex flex-col items-center">
      <div className="font-serif text-[22px] font-medium text-text">How can I help?</div>
      <p className="mt-1 max-w-[420px] text-center text-[12.5px] text-text-muted">
        {online
          ? 'Attach the decisions you want this model to see. Nothing else from your journal is sent.'
          : 'Attach a decision for the full detail, or just ask — the local model can see your recent titles.'}
      </p>
      <button
        type="button"
        onClick={onAttach}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
      >
        <Paperclip size={12} strokeWidth={2} />
        Attach decisions
      </button>
      {canQuickSend && (
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
      )}
    </div>
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

/** Shown while the client is waiting before another attempt. */
function RetryBanner({
  retry
}: {
  retry: { attempt: number; maxAttempts: number; waitMs: number; reason: string }
}) {
  const [left, setLeft] = useState(Math.ceil(retry.waitMs / 1000))

  useEffect(() => {
    setLeft(Math.ceil(retry.waitMs / 1000))
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [retry.attempt, retry.waitMs])

  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-[12.5px] text-amber-700 dark:text-amber-400">
      <Loader2 size={14} strokeWidth={2} className="mt-0.5 shrink-0 animate-spin" />
      <span>
        {retry.reason}. Retrying in {left}s… (attempt {retry.attempt} of {retry.maxAttempts - 1})
      </span>
    </div>
  )
}

/** A dead end should offer the two things that actually help. */
function ErrorPanel({
  message,
  code,
  onRetry,
  onPickModel
}: {
  message: string
  code: string | null
  onRetry: () => void
  onPickModel: () => void
}) {
  const privacy = code === 'no-private-route'
  return (
    <div
      className={[
        'rounded-xl border px-4 py-3',
        privacy
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-red-500/30 bg-red-500/5'
      ].join(' ')}
    >
      <div
        className={[
          'flex items-start gap-2 text-[12.5px]',
          privacy ? 'text-amber-700 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
        ].join(' ')}
      >
        {privacy ? (
          <ShieldAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
        ) : (
          <AlertCircle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
        )}
        <span>{message}</span>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text hover:bg-nav-active"
        >
          <RefreshCw size={11} strokeWidth={2} />
          Try again
        </button>
        <button
          type="button"
          onClick={onPickModel}
          className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text hover:bg-nav-active"
        >
          Pick another model
        </button>
      </div>
    </div>
  )
}
