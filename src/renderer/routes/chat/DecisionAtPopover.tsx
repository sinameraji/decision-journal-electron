import { useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'

interface DecisionAtPopoverProps {
  decisions: Decision[] | null
  results: Decision[]
  query: string
  activeIndex: number
  onHoverIndex: (idx: number) => void
  onSelect: (decision: Decision) => void
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function filterDecisions(decisions: Decision[], query: string): Decision[] {
  const q = query.trim().toLowerCase()
  if (q === '') return decisions.slice(0, 50)
  return decisions
    .filter((d) => {
      const hay = [d.title, d.situation, d.problemStatement].join(' ').toLowerCase()
      return hay.includes(q)
    })
    .slice(0, 50)
}

export default function DecisionAtPopover({
  decisions,
  results,
  query,
  activeIndex,
  onHoverIndex,
  onSelect
}: DecisionAtPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-decision-index="${activeIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <FileText size={11} strokeWidth={2} />
        Decision · type to search
      </div>
      <div ref={listRef} className="max-h-[260px] overflow-y-auto py-1">
        {decisions === null ? (
          <div className="px-3.5 py-3 text-[12px] text-text-muted">Loading decisions…</div>
        ) : decisions.length === 0 ? (
          <div className="px-3.5 py-3 text-[12px] text-text-muted">
            You haven't written any decisions yet.
          </div>
        ) : results.length === 0 ? (
          <div className="px-3.5 py-3 text-[12px] text-text-muted">
            No decisions match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          results.map((d, idx) => {
            const active = idx === activeIndex
            return (
              <button
                key={d.id}
                type="button"
                data-decision-index={idx}
                onMouseEnter={() => onHoverIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(d)
                }}
                className={[
                  'flex w-full flex-col items-start gap-0.5 px-3.5 py-2 text-left',
                  active ? 'bg-nav-active' : 'hover:bg-nav-active'
                ].join(' ')}
              >
                <span className="line-clamp-1 text-[13px] font-medium text-text">
                  {d.title || '(untitled)'}
                </span>
                <span className="text-[11px] text-text-muted">
                  Decided {formatDate(d.decidedAt)}
                </span>
              </button>
            )
          })
        )}
      </div>
      <div className="border-t border-border bg-bg/50 px-3.5 py-1.5 text-[10.5px] text-text-muted">
        ↑↓ navigate · ↵ select · esc cancel
      </div>
    </div>
  )
}
