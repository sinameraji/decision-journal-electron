import { ExternalLink, Cpu, Trash2, Download, RefreshCw, Terminal, Globe, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { InstalledModel } from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'
import ModelCard from './ModelCard'
import PrivacyCallout from './PrivacyCallout'
import OnlineModelList from './OnlineModelList'

export default function ModelSetup() {
  const status = useChatStore((s) => s.status)
  const catalog = useChatStore((s) => s.catalog)
  const installed = useChatStore((s) => s.installed)
  const online = useChatStore((s) => s.online)
  const selectModel = useChatStore((s) => s.selectModel)
  const removeModel = useChatStore((s) => s.removeModel)
  const refresh = useChatStore((s) => s.refresh)

  const [checking, setChecking] = useState(false)

  const catalogIds = new Set(catalog.map((m) => m.id))
  const extras = installed.filter((m) => !catalogIds.has(m.id))
  const hasInstalled = catalog.some((m) => m.installed) || extras.length > 0
  const ollamaRunning = status?.running === true
  const onlineReady = online?.enabled === true && online.hasKey

  function handleOpen(url: string) {
    void window.api.ollama.openExternal(url)
  }

  async function handleCheck() {
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  return (
    <div className="mx-auto max-w-[780px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Pick a model
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Chat with a model running on your Mac, or — if you have turned it on — with an online
        model through your own OpenRouter account.
      </p>

      {status && ollamaRunning && (
        <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[11.5px] text-text-muted">
          <Cpu size={12} strokeWidth={2} />
          <span>
            {status.hardware.arch === 'arm64' ? 'Apple Silicon' : 'Intel'} ·{' '}
            {status.hardware.totalRamGB} GB RAM
          </span>
          {status.version && <span className="opacity-60">· Ollama v{status.version}</span>}
        </div>
      )}

      <SectionHeading>On this Mac</SectionHeading>

      {ollamaRunning ? (
        <>
          <div className="flex flex-col gap-3">
            {catalog.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                canUse={model.installed && model.fit !== 'too-big'}
                onSelect={() => selectModel('ollama', model.id)}
              />
            ))}
          </div>

          {extras.length > 0 && (
            <>
              <h3 className="mt-6 mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
                Also installed on your Mac
              </h3>
              <div className="flex flex-col gap-2">
                {extras.map((m) => (
                  <ExtraModelRow
                    key={m.id}
                    model={m}
                    onSelect={() => selectModel('ollama', m.id)}
                    onRemove={() => removeModel(m.id)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="mt-4 text-center text-[11.5px] text-text-muted">
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
        </>
      ) : (
        <OllamaMissingCard checking={checking} onCheck={handleCheck} onOpen={handleOpen} />
      )}

      <SectionHeading>Online, through OpenRouter</SectionHeading>

      {onlineReady ? (
        <OnlineModelList onSelect={(id) => selectModel('openrouter', id)} />
      ) : (
        <OnlineDisabledCard hasKey={online?.hasKey === true} enabled={online?.enabled === true} />
      )}

      <div className="mt-8">
        <PrivacyCallout onlineEnabled={onlineReady} />
      </div>

      {!hasInstalled && !onlineReady && (
        <p className="mt-4 text-center text-[11.5px] text-text-muted">
          Every other part of Decision Journal works without either of these.
        </p>
      )}
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
      {children}
    </h2>
  )
}

function OllamaMissingCard({
  checking,
  onCheck,
  onOpen
}: {
  checking: boolean
  onCheck: () => void
  onOpen: (url: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-text">
          <Download size={18} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[19px] font-medium text-text">
            Install Ollama to run a model locally
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            Ollama runs open-source AI models directly on your Mac, so the chat works without
            sending anything over the network. It’s free, about 150 MB, and takes less than a
            minute.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen('https://ollama.com/download')}
              className="inline-flex items-center gap-2 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3.5 py-2 text-[12.5px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
            >
              <Download size={14} strokeWidth={2} />
              Download Ollama
              <ExternalLink size={12} strokeWidth={2} className="opacity-70" />
            </button>
            <button
              type="button"
              onClick={onCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[12.5px] text-text hover:bg-nav-active disabled:opacity-50"
            >
              <RefreshCw size={14} strokeWidth={2} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking…' : 'I installed it — check again'}
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-border bg-bg px-4 py-3">
            <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
              <Terminal size={12} strokeWidth={2} />
              After installing
            </div>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-[12.5px] leading-relaxed text-text-muted">
              <li>Open the Ollama app once so it can start its background service.</li>
              <li>Come back here and click “check again”.</li>
              <li>Pick a small model — we’ll recommend ones that fit your Mac.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

function OnlineDisabledCard({ enabled, hasKey }: { enabled: boolean; hasKey: boolean }) {
  const missing = enabled && !hasKey
  return (
    <div className="rounded-2xl border border-border bg-bg-elevated p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-bg text-text">
          {missing ? <KeyRound size={18} strokeWidth={1.75} /> : <Globe size={18} strokeWidth={1.75} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[19px] font-medium text-text">
            {missing ? 'Add your OpenRouter API key' : 'Online AI is off'}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
            {missing
              ? 'Online AI is on, but there is no API key saved yet. Add one to pick an online model.'
              : 'Off by default. If you turn it on, you bring your own OpenRouter API key and the messages plus any decisions you attach are sent to OpenRouter and the model provider. Your journal stays encrypted on this Mac and nothing is sent unless you attach it.'}
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-2 text-[12.5px] text-text hover:bg-nav-active"
          >
            Open Settings → Online AI
          </Link>
        </div>
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
