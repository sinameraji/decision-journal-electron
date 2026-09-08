import { useEffect, useState } from 'react'
import { AlertTriangle, Globe, Loader2, X } from 'lucide-react'
import type { AiProvider, PayloadPreview } from '@shared/ai'

interface Props {
  provider: AiProvider
  modelId: string
  conversationId: string | null
  attachments: string[]
  pendingText: string
  /** Null when opened as a plain preview rather than as the consent gate. */
  onConfirm: (() => void) | null
  onClose: () => void
}

/**
 * The disclosure shown before the first online message in a thread, and the
 * "what exactly gets sent" preview available at any time. Both render the same
 * payload the main process would build, so what the user approves is what goes.
 */
export default function SendReviewModal({
  provider,
  modelId,
  conversationId,
  attachments,
  pendingText,
  onConfirm,
  onClose
}: Props) {
  const [preview, setPreview] = useState<PayloadPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.ai
      .preview({
        conversationId,
        provider,
        modelId,
        attachments: { decisionIds: attachments },
        pendingText
      })
      .then((res) => {
        if (cancelled) return
        if (res.ok) setPreview(res.preview)
        else setError(res.message)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, provider, modelId, attachments, pendingText])

  const online = provider === 'openrouter'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-[620px] flex-col rounded-2xl border border-border bg-bg-elevated shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h3 className="font-serif text-[20px] font-medium text-text">
              {onConfirm ? 'Send this chat online?' : 'What gets sent'}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-text-muted">
              {online ? 'OpenRouter · ' : 'On this Mac · '}
              <span className="font-mono">{modelId}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:text-text"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {online && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <Globe
                size={14}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
              />
              <div className="text-[12.5px] leading-relaxed text-text-muted">
                Everything listed below leaves your Mac and is sent to OpenRouter and the model
                provider, billed to your OpenRouter account. The request is pinned to a
                zero-data-retention route with provider training refused, but that is a policy
                those services apply — not processing on your device, and not end-to-end
                encryption. Once sent, it cannot be recalled.
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {!preview && !error && (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-text-muted">
              <Loader2 size={14} strokeWidth={2} className="animate-spin" />
              Building the payload…
            </div>
          )}

          {preview && (
            <>
              <Stat label="Decisions attached">
                {preview.attachedDecisionTitles.length === 0 ? (
                  <span className="text-text-muted">None — no journal entries are included.</span>
                ) : (
                  <ul className="list-disc space-y-0.5 pl-4">
                    {preview.attachedDecisionTitles.map((t, i) => (
                      <li key={i}>{t || '(untitled)'}</li>
                    ))}
                  </ul>
                )}
              </Stat>

              <Stat label="Messages in this thread">
                {preview.messages.length} message{preview.messages.length === 1 ? '' : 's'}
                {preview.messages.length > 1 && online
                  ? ' — including earlier turns, which the model needs for context'
                  : ''}
              </Stat>

              <Stat label="Size">
                ~{preview.approxTokens.toLocaleString()} tokens
                {preview.contextLimit
                  ? ` of a ${preview.contextLimit.toLocaleString()}-token context window`
                  : ''}
              </Stat>

              {online && (
                <Stat label="Estimated cost for this request">
                  {preview.estimatedPromptCostUsd === null
                    ? 'Unknown — no price listed for this model.'
                    : `About $${preview.estimatedPromptCostUsd.toFixed(4)} for the input, plus the reply. This is an estimate, not a billing cap — set a budget on your OpenRouter key if you want a hard limit.`}
                </Stat>
              )}

              {!preview.withinBudget && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12.5px] text-red-600 dark:text-red-400">
                  <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
                  This is larger than the app will send in one request. Attach fewer decisions or
                  start a new chat.
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className="mt-4 text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                {showRaw ? 'Hide' : 'Show'} the exact text
              </button>

              {showRaw && (
                <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-[11px] leading-relaxed text-text-muted">
                  {preview.systemPrompt}
                  {preview.messages
                    .map((m) => `\n\n[${m.role}]\n${m.content}`)
                    .join('')}
                </pre>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            {onConfirm ? 'Cancel' : 'Close'}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!preview || !preview.withinBudget}
              className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
            >
              Send online
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-[12.5px] leading-relaxed text-text">{children}</div>
    </div>
  )
}
