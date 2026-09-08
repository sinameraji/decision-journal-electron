import { useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { Decision } from '@shared/ipc-contract'
import type { MemoryBackfillEstimate } from '@shared/memory'
import { useMemoryStore } from '../store/memory'

/**
 * Backfill is never automatic: enabling memory only covers decisions saved from
 * then on. This is the explicit, scoped batch — pick the entries, see the cost,
 * then queue them.
 */
export default function MemoryBackfillModal({ onClose }: { onClose: () => void }) {
  const refresh = useMemoryStore((s) => s.refresh)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [estimate, setEstimate] = useState<MemoryBackfillEstimate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.decisions.list().then((all) => setDecisions(all.filter((d) => !d.isSample)))
  }, [])

  useEffect(() => {
    if (picked.length === 0) {
      setEstimate(null)
      return
    }
    let cancelled = false
    void window.api.memory.estimateBackfill(picked).then((e) => {
      if (!cancelled) setEstimate(e)
    })
    return () => {
      cancelled = true
    }
  }, [picked])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return decisions
    return decisions.filter((d) => d.title.toLowerCase().includes(q))
  }, [decisions, query])

  async function run() {
    setBusy(true)
    setError(null)
    const res = await window.api.memory.runBackfill(picked)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-2xl border border-border bg-bg-elevated shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="font-serif text-[20px] font-medium text-text">
              Extract from past decisions
            </h3>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Each one you pick is sent to the extraction model, one at a time.
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
              placeholder="Search…"
              className="w-full bg-transparent text-[12.5px] text-text placeholder:text-text-muted focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              setPicked(picked.length === filtered.length ? [] : filtered.map((d) => d.id))
            }
            className="mt-2 text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
          >
            {picked.length === filtered.length ? 'Clear selection' : 'Select all shown'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-[12.5px] text-text-muted">
              No decisions to show.
            </div>
          ) : (
            filtered.map((d) => {
              const isPicked = picked.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setPicked((prev) =>
                      prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                    )
                  }
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
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="border-t border-border px-6 py-3">
          {error && <div className="mb-2 text-[12px] text-red-500">{error}</div>}
          <div className="flex items-center justify-between">
            <div className="text-[11.5px] text-text-muted">
              {estimate === null ? (
                'Nothing selected'
              ) : (
                <>
                  {estimate.decisionCount} decision{estimate.decisionCount === 1 ? '' : 's'} · ~
                  {estimate.approxTokens.toLocaleString()} tokens ·{' '}
                  {estimate.estimatedCostUsd === null
                    ? 'cost unknown'
                    : `about $${estimate.estimatedCostUsd.toFixed(4)}`}
                  <span className="block opacity-70">An estimate, not a billing cap.</span>
                </>
              )}
            </div>
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
                onClick={run}
                disabled={busy || picked.length === 0}
                className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
              >
                {busy ? 'Queueing…' : 'Extract'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
