import { useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'

interface Props {
  selected: string[]
  onClose: () => void
  onSave: (ids: string[]) => void
}

/**
 * Picks which decisions a conversation is allowed to send. Nothing else in the
 * journal is included in a request, so this list is the whole of what an online
 * model can see.
 */
export default function AttachDecisionsModal({ selected, onClose, onSave }: Props) {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>(selected)

  useEffect(() => {
    let cancelled = false
    void window.api.decisions.list().then((all) => {
      if (!cancelled) {
        setDecisions(all)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return decisions
    return decisions.filter(
      (d) => d.title.toLowerCase().includes(q) || d.situation.toLowerCase().includes(q)
    )
  }, [decisions, query])

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-2xl border border-border bg-bg-elevated shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="font-serif text-[20px] font-medium text-text">Attach decisions</h3>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Only what you attach here is sent with this chat.
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

        <div className="border-b border-border px-6 py-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5">
            <Search size={13} strokeWidth={2} className="text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your decisions…"
              autoFocus
              className="w-full bg-transparent text-[12.5px] text-text placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-text-muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-text-muted">
              {decisions.length === 0 ? 'No decisions recorded yet.' : 'Nothing matches that search.'}
            </div>
          ) : (
            filtered.map((d) => {
              const isPicked = picked.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-nav-active"
                >
                  <span
                    className={[
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isPicked
                        ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text dark:border-text dark:bg-text dark:text-bg'
                        : 'border-border bg-bg'
                    ].join(' ')}
                  >
                    {isPicked && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-text">
                      {d.title || '(untitled)'}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-text-muted">
                      {new Date(d.decidedAt).toLocaleDateString()}
                      {d.reviewedAt ? ' · reviewed' : ' · not reviewed'}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="text-[11.5px] text-text-muted">
            {picked.length === 0
              ? 'Nothing attached'
              : `${picked.length} decision${picked.length === 1 ? '' : 's'} attached`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(picked)}
              className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
