import { useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Calendar,
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Trash2
} from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export default function DecisionCard({
  decision,
  onRequestDelete
}: {
  decision: Decision
  onRequestDelete: (d: Decision) => void
}) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const preview = decision.situation?.trim()
  const hasPreview = preview && preview.length > 0

  const openEdit = () => navigate(`/decisions/${decision.id}/edit`)

  const stop = (e: MouseEvent) => {
    e.stopPropagation()
  }

  return (
    <article
      onClick={openEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') openEdit()
      }}
      tabIndex={0}
      role="button"
      className="group relative cursor-pointer rounded-xl border border-border bg-bg-elevated px-5 py-4 transition-colors hover:border-text/20 hover:bg-bg-elevated/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-text/20"
    >
      <div className="flex items-start gap-3">
        <CheckCircle2
          size={18}
          strokeWidth={1.75}
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-relaxed text-text">{decision.title}</p>
          {decision.isSample === 1 && (
            <span className="mt-1.5 inline-block rounded-full border border-border bg-bg px-2 py-0.5 text-[10.5px] uppercase tracking-wide text-text-muted">
              Sample
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1.5 whitespace-nowrap pt-0.5 text-[12px] text-text-muted">
            <Calendar size={13} strokeWidth={1.75} />
            <span>{formatDate(decision.decidedAt)}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setMenuOpen((v) => !v)
              }}
              aria-label="More"
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted opacity-0 transition-opacity hover:bg-nav-active hover:text-text group-hover:opacity-100 focus:opacity-100"
            >
              <MoreHorizontal size={15} strokeWidth={1.75} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    stop(e)
                    setMenuOpen(false)
                  }}
                />
                <div
                  className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-lg"
                  onClick={stop}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e)
                      setMenuOpen(false)
                      openEdit()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-text hover:bg-nav-active"
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      stop(e)
                      setMenuOpen(false)
                      onRequestDelete(decision)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && hasPreview && (
        <p className="mt-3 whitespace-pre-wrap pl-[30px] pr-4 text-[13px] leading-relaxed text-text-muted">
          {preview}
        </p>
      )}

      {hasPreview && (
        <button
          type="button"
          onClick={(e) => {
            stop(e)
            setExpanded((v) => !v)
          }}
          className="mt-3 flex w-full items-center justify-center text-text-muted hover:text-text"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <ChevronUp size={16} strokeWidth={1.75} />
          ) : (
            <ChevronDown size={16} strokeWidth={1.75} />
          )}
        </button>
      )}
    </article>
  )
}
