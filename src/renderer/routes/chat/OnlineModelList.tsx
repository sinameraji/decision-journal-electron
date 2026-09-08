import { useMemo, useState } from 'react'
import { Globe, RefreshCw, Search, ShieldCheck, Star } from 'lucide-react'
import { DEFAULT_ONLINE_MODEL, type OnlineModel } from '@shared/ai'
import { useChatStore } from '../../store/chat'

function formatPrice(perMillion: number | null): string {
  if (perMillion === null) return '—'
  if (perMillion === 0) return 'free'
  if (perMillion < 1) return `$${perMillion.toFixed(2)}`
  return `$${perMillion.toFixed(2)}`
}

function formatContext(tokens: number): string {
  if (!tokens) return 'unknown context'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M context`
  return `${Math.round(tokens / 1000)}K context`
}

export default function OnlineModelList({ onSelect }: { onSelect: (modelId: string) => void }) {
  const onlineCatalog = useChatStore((s) => s.onlineCatalog)
  const online = useChatStore((s) => s.online)
  const refreshOnline = useChatStore((s) => s.refreshOnline)
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultModel = online?.defaultModel ?? DEFAULT_ONLINE_MODEL

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...onlineCatalog].sort((a, b) => {
      if (a.id === defaultModel) return -1
      if (b.id === defaultModel) return 1
      return a.name.localeCompare(b.name)
    })
    if (!q) return sorted.slice(0, 40)
    return sorted.filter((m) => m.name.toLowerCase().includes(q) || m.id.includes(q)).slice(0, 40)
  }, [onlineCatalog, query, defaultModel])

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    const res = await window.api.ai.refreshCatalog()
    if (!res.ok) setError(res.message)
    await refreshOnline()
    setRefreshing(false)
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5">
          <Search size={13} strokeWidth={2} className="text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search online models…"
            className="w-full bg-transparent text-[12.5px] text-text placeholder:text-text-muted focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text disabled:opacity-50"
        >
          <RefreshCw size={12} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {onlineCatalog.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elevated px-4 py-5 text-center text-[12.5px] text-text-muted">
          No models loaded yet. Press Refresh to fetch the OpenRouter catalog.
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-text-muted">
            <ShieldCheck size={11} strokeWidth={2} />
            Only models with a zero-data-retention route are listed. Prices are per million
            tokens, billed to your OpenRouter account.
          </div>
          <div className="flex flex-col gap-2">
            {filtered.map((m) => (
              <OnlineModelRow
                key={m.id}
                model={m}
                isDefault={m.id === defaultModel}
                onSelect={() => onSelect(m.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-border bg-bg-elevated px-4 py-4 text-center text-[12.5px] text-text-muted">
                No model matches “{query}”.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function OnlineModelRow({
  model,
  isDefault,
  onSelect
}: {
  model: OnlineModel
  isDefault: boolean
  onSelect: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text-muted">
        <Globe size={13} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text">{model.name}</span>
          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">
              <Star size={9} strokeWidth={2} /> Default
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] text-text-muted">{model.id}</div>
        <div className="mt-1 text-[11px] text-text-muted">
          {formatContext(model.contextLength)} · in {formatPrice(model.promptUsdPerMillion)}/M ·
          out {formatPrice(model.completionUsdPerMillion)}/M
        </div>
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="shrink-0 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[11.5px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
      >
        Chat
      </button>
    </div>
  )
}
