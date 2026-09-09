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
import { LENS_OPENERS } from '@shared/ipc-contract'
import { borrowedOpener } from '@shared/roleModels'
import { useChatStore } from '../../store/chat'
import MicButton from '../../components/voice/MicButton'
import Message from './Message'
import PastChatsDropdown from './PastChatsDropdown'
import AttachDecisionsModal from './AttachDecisionsModal'
import SendReviewModal from './SendReviewModal'
import ModelSwitcher from './ModelSwitcher'
import LensSlashPopover, {
  Avatar,
  buildFrameOptions,
  filterFrames,
  type FrameOption
} from './LensSlashPopover'
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

  const borrowedFrameworks = useChatStore((s) => s.borrowedFrameworks)
  const frameOptions = buildFrameOptions(borrowedFrameworks)
  const lensResults = slashQuery === null ? [] : filterFrames(frameOptions, slashQuery)

  // The picker offers both kinds, so label and opener are resolved from the
  // selection rather than looked up in the built-in table.
  const activeFrame = lens
    ? (frameOptions.find(
        (o) => JSON.stringify(o.selection) === JSON.stringify(lens)
      ) ?? null)
    : null
  const lensLabel = activeFrame?.label ?? null
  const lensOpener =
    lens?.kind === 'builtin'
      ? LENS_OPENERS[lens.lens]
      : activeFrame?.wholePerson && activeFrame.borrowedFrom
        ? `Analyse this decision the way ${activeFrame.borrowedFrom} would.`
        : activeFrame?.borrowedFrom
          ? borrowedOpener(activeFrame.borrowedFrom, activeFrame.label)
          : ''
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

  function pickLens(option: FrameOption) {
    setLens(option.selection)
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
  const setSwitcherOpen = useChatStore((s) => s.setSwitcherOpen)
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
  const lensRunReady = lens !== null && lensLabel !== null && attachments.length > 0
  const canSend = input.trim().length > 0 || lensRunReady

  async function handleSend() {
    if (!canSend || streaming || sending) return
    // The first online turn in a thread, and any turn after the attachment
    // scope widened, has to pass through the disclosure first.
    if (online && !onlineConsentConfirmed) {
      setReview('consent')
      return
    }
    const text = input.trim() || lensOpener
    setInput('')
    await sendMessage(text)
  }

  async function handleConfirmedSend() {
    confirmOnlineConsent()
    setReview(null)
    const text = input.trim() || lensOpener
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
      {/* One row, not two. The header was eating a third of the window before a
          single message was visible: a model line, a subtitle line, and a
          separate strip of scope controls. Everything here is one line now,
          with the provider shown as a dot beside the model rather than a pill
          of its own. */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span
          className={[
            'h-1.5 w-1.5 shrink-0 rounded-full',
            online ? 'bg-amber-500' : 'bg-emerald-500'
          ].join(' ')}
          title={subtitle}
        />
        <ModelSwitcher label={displayLabel} />

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderButton
            icon={<Paperclip size={12} strokeWidth={2} />}
            label={attachments.length === 0 ? 'Attach' : String(attachments.length)}
            title={
              attachments.length === 0
                ? 'Attach decisions to this chat'
                : `${attachments.length} decision${attachments.length === 1 ? '' : 's'} attached`
            }
            onClick={() => setShowAttach(true)}
            active={attachments.length > 0}
          />
          {memoryAvailable && (
            <HeaderButton
              icon={<Brain size={12} strokeWidth={2} />}
              label={includeMemories ? 'Memories' : 'Memories'}
              title={
                includeMemories
                  ? 'Your approved memories are sent with this conversation'
                  : 'This conversation is not sending your approved memories'
              }
              onClick={() => setIncludeMemories(!includeMemories)}
              active={includeMemories}
              muted={!includeMemories}
            />
          )}
          <HeaderButton
            icon={<Eye size={12} strokeWidth={2} />}
            label="What gets sent"
            title="See exactly what this message will send"
            onClick={() => setReview('preview')}
          />
          <span className="mx-0.5 h-4 w-px bg-border" />
          <PastChatsDropdown />
          {messages.length > 0 && (
            <HeaderButton
              icon={<Eraser size={12} strokeWidth={2} />}
              label=""
              title="Start a new chat"
              onClick={clearConversation}
            />
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 && !streaming && !sending ? (
          <EmptyState
            online={online}
            lensReady={lensRunReady ? lensLabel : null}
            hasAttachments={attachments.length > 0}
            hasRoleModels={borrowedFrameworks.length > 0}
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
                onPickModel={() => setSwitcherOpen(true)}
              />
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border pb-3 pt-2">
        {lens && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-2.5 py-1 text-[11.5px] font-medium text-accent-text dark:border-border dark:bg-bg-elevated dark:text-text">
              {activeFrame?.borrowedFrom ? (
                <Avatar name={activeFrame.borrowedFrom} size={14} />
              ) : (
                <Sparkles size={11} strokeWidth={2} />
              )}
              {lensLabel}
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
              results={lensResults}
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
                ? `Press ⏎ to run ${lensLabel} — or add a question first…`
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
        <div className="mt-1 text-center text-[10px] text-text-muted/70">
          {online
            ? 'Sent to OpenRouter and the model provider — this chat and what you attach, nothing else.'
            : 'Stays on this Mac.'}
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
  hasAttachments,
  hasRoleModels,
  onAttach,
  onRun
}: {
  online: boolean
  lensReady: string | null
  hasAttachments: boolean
  hasRoleModels: boolean
  onAttach: () => void
  onRun: () => void
}) {
  // These used to be fixed, and the first one asked about "the decisions I
  // attached" on a screen whose whole point is that nothing is attached yet.
  // They now match the state the user is actually in, and lead with the thing
  // this app is for: pressure-testing reasoning, not summarising it.
  const suggestions = hasAttachments
    ? [
        'What is the weakest assumption in this decision?',
        'What would have to be true for this to turn out badly?',
        'What did I fail to consider here?'
      ]
    : online
      ? [
          'What should I be asking myself before I commit to something big?',
          'How do I tell a good decision from a good outcome?',
          'What makes a forecast worth writing down?'
        ]
      : [
          'What patterns show up across my recent decisions?',
          'What should I be asking myself before I commit to something big?',
          'How do I tell a good decision from a good outcome?'
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
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onAttach}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
        >
          <Paperclip size={12} strokeWidth={2} />
          Attach decisions
        </button>
        <span className="text-[11.5px] text-text-muted">
          or type <span className="font-mono text-text">/</span> for a frame
          {hasRoleModels ? ', including your role models' : ''}
        </span>
      </div>
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
          Switch model
        </button>
      </div>
    </div>
  )
}

/** Compact header control: icon always, label only when it earns the width. */
function HeaderButton({
  icon,
  label,
  title,
  onClick,
  active,
  muted
}: {
  icon: React.ReactNode
  label: string
  title: string
  onClick: () => void
  active?: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
        active
          ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text dark:border-border dark:bg-bg-elevated dark:text-text'
          : 'border-border bg-bg text-text-muted hover:text-text',
        muted ? 'opacity-70' : ''
      ].join(' ')}
    >
      {icon}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  )
}
