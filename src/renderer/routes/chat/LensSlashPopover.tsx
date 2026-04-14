import { useEffect, useMemo, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import {
  LENS_DESCRIPTIONS,
  LENS_KINDS,
  LENS_LABELS,
  type LensKind
} from '@shared/ipc-contract'

interface LensSlashPopoverProps {
  query: string
  activeIndex: number
  onHoverIndex: (idx: number) => void
  onSelect: (kind: LensKind) => void
}

export function filterLenses(query: string): LensKind[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...LENS_KINDS]
  return LENS_KINDS.filter((k) => {
    const label = LENS_LABELS[k].toLowerCase()
    return k.includes(q) || label.includes(q) || label.replace(/\s/g, '').includes(q)
  })
}

export default function LensSlashPopover({
  query,
  activeIndex,
  onHoverIndex,
  onSelect
}: LensSlashPopoverProps) {
  const results = useMemo(() => filterLenses(query), [query])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-lens-index="${activeIndex}"]`
    )
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <Sparkles size={11} strokeWidth={2} />
        Lens
      </div>
      <div ref={listRef} className="max-h-[260px] overflow-y-auto py-1">
        {results.length === 0 ? (
          <div className="px-3.5 py-3 text-[12px] text-text-muted">No matching lens.</div>
        ) : (
          results.map((kind, idx) => {
            const active = idx === activeIndex
            return (
              <button
                key={kind}
                type="button"
                data-lens-index={idx}
                onMouseEnter={() => onHoverIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onSelect(kind)
                }}
                className={[
                  'flex w-full flex-col items-start gap-0.5 px-3.5 py-2 text-left',
                  active ? 'bg-nav-active' : 'hover:bg-nav-active'
                ].join(' ')}
              >
                <span className="text-[13px] font-medium text-text">{LENS_LABELS[kind]}</span>
                <span className="text-[11.5px] leading-snug text-text-muted">
                  {LENS_DESCRIPTIONS[kind]}
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
