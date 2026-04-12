import { ExternalLink, Cpu, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { InstalledModel } from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'
import ModelCard from './ModelCard'
import PrivacyCallout from './PrivacyCallout'

export default function ModelSetup() {
  const status = useChatStore((s) => s.status)
  const catalog = useChatStore((s) => s.catalog)
  const installed = useChatStore((s) => s.installed)
  const selectModel = useChatStore((s) => s.selectModel)
  const removeModel = useChatStore((s) => s.removeModel)
  const catalogIds = new Set(catalog.map((m) => m.id))
  const extras = installed.filter((m) => !catalogIds.has(m.id))
  const hasInstalled = catalog.some((m) => m.installed) || extras.length > 0

  function handleOpen(url: string) {
    void window.api.ollama.openExternal(url)
  }

  return (
    <div className="mx-auto max-w-[780px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        {hasInstalled ? 'Pick a model' : 'Install a model'}
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        {hasInstalled
          ? 'Choose which local model to chat with. You can install more or remove ones you no longer need.'
          : 'These models run entirely on your Mac. We picked ones that match your hardware so nothing freezes.'}
      </p>

      {status && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[11.5px] text-text-muted">
          <Cpu size={12} strokeWidth={2} />
          <span>
            {status.hardware.arch === 'arm64' ? 'Apple Silicon' : 'Intel'} ·{' '}
            {status.hardware.totalRamGB} GB RAM
          </span>
          {status.version && <span className="opacity-60">· Ollama v{status.version}</span>}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {catalog.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            canUse={model.installed && model.fit !== 'too-big'}
            onSelect={() => selectModel(model.id)}
          />
        ))}
      </div>

      {extras.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
            Also installed on your Mac
          </h2>
          <div className="flex flex-col gap-2">
            {extras.map((m) => (
              <ExtraModelRow
                key={m.id}
                model={m}
                onSelect={() => selectModel(m.id)}
                onRemove={() => removeModel(m.id)}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-6 text-center text-[11.5px] text-text-muted">
        Looking for a different model?{' '}
        <button
          type="button"
          onClick={() => handleOpen('https://ollama.com/library')}
          className="inline-flex items-center gap-1 underline-offset-2 hover:text-text hover:underline"
        >
          Browse the full Ollama library
          <ExternalLink size={10} strokeWidth={2} />
        </button>
      </div>

      <div className="mt-6">
        <PrivacyCallout />
      </div>
    </div>
  )
}

function ExtraModelRow({
  model,
  onSelect,
  onRemove
}: {
  model: InstalledModel
  onSelect: () => void
  onRemove: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const sizeGB = (model.sizeBytes / 1024 ** 3).toFixed(1)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-text">{model.id}</span>
          <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10.5px] text-text-muted">
            {model.parameterSize ?? '?'} · {sizeGB} GB
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-text-muted">
          Not in our curated list — use at your own risk depending on your Mac.
        </div>
      </div>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 text-[11.5px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false)
              onRemove()
            }}
            className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11.5px] font-medium text-red-600 hover:bg-red-500/20 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:text-red-500"
            aria-label="Delete"
          >
            <Trash2 size={12} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onSelect}
            className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[11.5px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
          >
            Chat
          </button>
        </div>
      )}
    </div>
  )
}
