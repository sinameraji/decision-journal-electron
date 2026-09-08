import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import {
  LENS_DESCRIPTIONS,
  LENS_KINDS,
  LENS_LABELS,
  type LensKind
} from '@shared/ipc-contract'
import { useChatStore } from '../store/chat'

/**
 * Launches a lens run from a decision.
 *
 * The decision is attached rather than pasted: the chat service builds the
 * prompt from the attachment scope, so the payload preview, the online
 * disclosure and zero-data-retention routing all apply exactly as they do to
 * any other message. The composer is pre-filled rather than auto-sent, so an
 * online run still passes through the disclosure.
 */
export default function LensPanel({ decisionId }: { decisionId: string }) {
  const navigate = useNavigate()
  const startLens = useChatStore((s) => s.startLens)
  const activeModel = useChatStore((s) => s.activeModel)
  const [hovered, setHovered] = useState<LensKind | null>(null)

  function run(kind: LensKind) {
    startLens(kind, decisionId)
    navigate('/chat')
  }

  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
          <Sparkles size={15} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[19px] font-medium text-text">Analyse with a lens</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">
            Opens a new chat with this decision attached and one analytical frame applied. You can
            also reach these from Chat by typing <span className="font-mono">/</span>.
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {LENS_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => run(kind)}
                onMouseEnter={() => setHovered(kind)}
                onMouseLeave={() => setHovered(null)}
                className={[
                  'rounded-xl border px-3.5 py-3 text-left transition-colors',
                  hovered === kind
                    ? 'border-[rgb(var(--accent))] bg-nav-active'
                    : 'border-border bg-bg'
                ].join(' ')}
              >
                <span className="block text-[13px] font-medium text-text">
                  {LENS_LABELS[kind]}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-text-muted">
                  {LENS_DESCRIPTIONS[kind]}
                </span>
              </button>
            ))}
          </div>

          {!activeModel && (
            <p className="mt-3 text-[11.5px] text-text-muted">
              You’ll pick a model when the chat opens.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
