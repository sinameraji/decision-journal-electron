import { useState } from 'react'
import { Check, Download, Info, Trash2, X, AlertTriangle } from 'lucide-react'
import type { CatalogModel, ModelInfo } from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'

interface Props {
  model: CatalogModel
  canUse: boolean
  onSelect: () => void
}

export default function ModelCard({ model, canUse, onSelect }: Props) {
  const pull = useChatStore((s) => s.pulls[model.id])
  const startPull = useChatStore((s) => s.startPull)
  const cancelPull = useChatStore((s) => s.cancelPull)
  const removeModel = useChatStore((s) => s.removeModel)

  const [showInfo, setShowInfo] = useState(false)
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleInfo() {
    setShowInfo(true)
    setLoadingInfo(true)
    const result = await window.api.ollama.show(model.id)
    setInfo(result)
    setLoadingInfo(false)
  }

  const progressPct =
    pull && pull.total > 0 ? Math.min(100, Math.round((pull.completed / pull.total) * 100)) : 0

  const fitBadge = (() => {
    if (model.fit === 'too-big') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-red-600 dark:text-red-400">
          <AlertTriangle size={10} strokeWidth={2} /> Too large for this Mac
        </span>
      )
    }
    if (model.fit === 'tight') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-600 dark:text-amber-400">
          Will run, but tight
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 dark:text-emerald-400">
        <Check size={10} strokeWidth={2.5} /> Fits your Mac
      </span>
    )
  })()

  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-[16px] font-medium text-text">{model.label}</span>
            <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10.5px] font-medium text-text-muted">
              {model.paramCount} · {model.sizeGB} GB
            </span>
            {fitBadge}
            {model.installed && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10.5px] font-medium text-text">
                Installed
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
            {model.description}
          </p>
          <p className="mt-1 text-[11.5px] text-text-muted/80">{model.fitReason}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {model.installed ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleInfo}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:text-text"
                aria-label="Model info"
              >
                <Info size={13} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:text-red-500"
                aria-label="Delete model"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={onSelect}
                disabled={!canUse}
                className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] font-medium text-accent-text hover:opacity-90 disabled:opacity-50 dark:border-border dark:bg-transparent dark:text-text"
              >
                Chat
              </button>
            </div>
          ) : pull ? (
            <button
              type="button"
              onClick={() => cancelPull(model.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text hover:text-red-500"
            >
              <X size={12} strokeWidth={2} />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startPull(model.id)}
              disabled={model.fit === 'too-big'}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-40 disabled:hover:bg-bg"
              title={model.fit === 'too-big' ? model.fitReason : undefined}
            >
              <Download size={12} strokeWidth={2} />
              Install
            </button>
          )}
        </div>
      </div>

      {pull && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] text-text-muted">
            <span>{pull.error ? pull.error : pull.status || 'preparing…'}</span>
            {pull.total > 0 && !pull.error && <span>{progressPct}%</span>}
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg">
            <div
              className={[
                'h-full transition-[width] duration-200',
                pull.error ? 'bg-red-500/70' : 'bg-[rgb(var(--accent))]'
              ].join(' ')}
              style={{ width: pull.error ? '100%' : `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[360px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
            <h3 className="font-serif text-[18px] font-medium text-text">Delete {model.label}?</h3>
            <p className="mt-2 text-[12.5px] text-text-muted">
              This removes the model from your Mac. You can re-install it anytime.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmDelete(false)
                  await removeModel(model.id)
                }}
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[12.5px] font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[420px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="font-serif text-[18px] font-medium text-text">{model.label}</h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:text-text"
                aria-label="Close"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
            {loadingInfo ? (
              <p className="mt-4 text-[12.5px] text-text-muted">Loading…</p>
            ) : info ? (
              <dl className="mt-4 space-y-2 text-[12.5px]">
                <InfoRow label="ID" value={info.id} />
                <InfoRow label="Parameters" value={info.parameterSize ?? '—'} />
                <InfoRow label="Quantization" value={info.quantization ?? '—'} />
                <InfoRow label="Family" value={info.family ?? '—'} />
                <InfoRow
                  label="Size on disk"
                  value={
                    info.sizeBytes > 0
                      ? `${(info.sizeBytes / 1024 ** 3).toFixed(2)} GB`
                      : '—'
                  }
                />
                {info.license && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      License (first 500 chars)
                    </div>
                    <p className="mt-1 max-h-24 overflow-auto rounded border border-border bg-bg p-2 font-mono text-[10.5px] text-text-muted">
                      {info.license}
                    </p>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-4 text-[12.5px] text-text-muted">
                Could not load model info.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-mono text-[11.5px] text-text">{value}</dd>
    </div>
  )
}
