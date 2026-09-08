import { useMemo, useState } from 'react'
import { Globe, RefreshCw, Search, ShieldAlert, ShieldCheck, Star } from 'lucide-react'
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
  const [confirming, setConfirming] = useState<OnlineModel | null>(null)

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
          <div className="mb-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-text-muted">
            <ShieldCheck size={11} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>
              Models marked <span className="text-emerald-700 dark:text-emerald-400">ZDR</span>{' '}
              are served by providers that enforce zero data retention. Ones marked{' '}
              <span className="text-red-600 dark:text-red-400">no ZDR</span> are not — picking one
              needs your explicit confirmation. Prices are per million tokens, billed to your
              OpenRouter account.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {filtered.map((m) => (
              <OnlineModelRow
                key={m.id}
                model={m}
                isDefault={m.id === defaultModel}
                onSelect={() => (m.zdrAvailable ? onSelect(m.id) : setConfirming(m))}
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

      {confirming && (
        <NonZdrConfirmModal
          model={confirming}
          onCancel={() => setConfirming(null)}
          onAccept={async () => {
            const model = confirming
            setConfirming(null)
            await window.api.ai.acknowledgeNonZdr(model.id)
            await refreshOnline()
            onSelect(model.id)
          }}
        />
      )}
    </div>
  )
}

/**
 * Selecting a model with no zero-data-retention route is a real change to what
 * happens to the user's journal content, so it is a decision they make once,
 * explicitly, and we record it.
 */
function NonZdrConfirmModal({
  model,
  onCancel,
  onAccept
}: {
  model: OnlineModel
  onCancel: () => void
  onAccept: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[470px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/5 text-red-600 dark:text-red-400">
            <ShieldAlert size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-[19px] font-medium text-text">
              This model does not enforce zero data retention
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-text-muted">{model.id}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-text-muted">
          <p>
            Every other online model here is routed only to providers that contractually agree not
            to keep your prompts. No provider serving{' '}
            <span className="font-medium text-text">{model.name}</span> does.
          </p>
          <p>
            If you pick it, the messages you send and the decisions you attach{' '}
            <span className="font-medium text-text">may be stored by the model provider</span>,
            for as long as their own policy allows, and we cannot tell you how long that is.
          </p>
          <p>
            Your journal on this Mac stays encrypted, and nothing you have not attached is ever
            sent. But what you do send leaves our reach entirely.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400"
          >
            I understand — use it anyway
          </button>
        </div>
      </div>
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
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
          <ZdrBadge model={model} />
          <span>
            {formatContext(model.contextLength)} · in {formatPrice(model.promptUsdPerMillion)}/M ·
            out {formatPrice(model.completionUsdPerMillion)}/M
          </span>
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

/**
 * Route count matters as much as the yes/no: a model with one ZDR route has no
 * headroom when that provider is busy, which is what a 429 actually is.
 */
function ZdrBadge({ model }: { model: OnlineModel }) {
  if (!model.zdrAvailable) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/5 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <ShieldAlert size={9} strokeWidth={2.5} />
        no ZDR
      </span>
    )
  }
  const thin = model.zdrProviderCount <= 1
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
      title={`Zero data retention via ${model.zdrProviders.join(', ') || 'a private provider'}`}
    >
      <ShieldCheck size={9} strokeWidth={2.5} />
      ZDR
      {model.zdrProviderCount > 0 && (
        <span className={thin ? 'text-amber-700 dark:text-amber-400' : 'opacity-70'}>
          · {model.zdrProviderCount} route{model.zdrProviderCount === 1 ? '' : 's'}
        </span>
      )}
    </span>
  )
}
