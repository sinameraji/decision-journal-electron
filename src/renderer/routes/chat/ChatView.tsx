import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronDown, Square, Eraser, AlertCircle } from 'lucide-react'
import { useChatStore } from '../../store/chat'
import Message from './Message'

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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSend() {
    if (!input.trim() || streaming) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

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
        <div className="flex items-end gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about a decision, or anything else…"
            rows={1}
            className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-text placeholder:text-text-muted focus:outline-none"
            disabled={!!streaming}
          />
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
              disabled={!input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
              aria-label="Send"
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
        <div className="mt-1.5 text-center text-[10.5px] text-text-muted/80">
          Messages and replies stay on this Mac. The model sees your recent decisions as
          context.
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
