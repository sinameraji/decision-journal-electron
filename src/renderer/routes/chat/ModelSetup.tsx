import { useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cpu,
  Download,
  ExternalLink,
  Globe,
  Laptop,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { InstalledModel } from '@shared/ipc-contract'
import { useChatStore } from '../../store/chat'
import ModelCard from './ModelCard'
import OnlineModelList from './OnlineModelList'

/**
 * Two steps rather than one long page.
 *
 * Step 1 is a compact chooser: where should chat run, and is each side ready.
 * Previously both providers were stacked on one screen, with a large Ollama
 * install card pushing the online option below the fold — online AI was easy
 * to miss entirely. Step 2 is whichever side the user picked.
 */
export default function ModelSetup() {
  const view = useChatStore((s) => s.setupView)
  const setView = useChatStore((s) => s.setSetupView)

  if (view === 'local') return <LocalPanel onBack={() => setView('chooser')} />
  if (view === 'online') return <OnlinePanel onBack={() => setView('chooser')} />
  return <Chooser onPick={setView} />
}

// ---------------- Step 1 ----------------

function Chooser({ onPick }: { onPick: (v: 'local' | 'online') => void }) {
  const status = useChatStore((s) => s.status)
  const installed = useChatStore((s) => s.installed)
  const online = useChatStore((s) => s.online)
  const onlineCatalog = useChatStore((s) => s.onlineCatalog)

  const ollamaRunning = status?.running === true
  const localReady = ollamaRunning && installed.length > 0
  const onlineReady = online?.enabled === true && online.hasKey

  return (
    <div className="mx-auto max-w-[640px] pt-2">
      <h1 className="font-serif text-[26px] font-medium leading-tight tracking-tight text-text">
        Where should chat run?
      </h1>
      <p className="mt-1 text-[12.5px] text-text-muted">
        You can change this any time from the chat header.
      </p>

      <div className="mt-5 flex flex-col gap-2.5">
        <Option
          icon={<Laptop size={17} strokeWidth={1.75} />}
          title="On this Mac"
          blurb="Private. Nothing leaves the machine."
          state={
            localReady
              ? { kind: 'ready', label: `${installed.length} model${installed.length === 1 ? '' : 's'} installed` }
              : ollamaRunning
                ? { kind: 'action', label: 'No model installed yet' }
                : { kind: 'off', label: 'Ollama not running' }
          }
          onClick={() => onPick('local')}
        />
        <Option
          icon={<Globe size={17} strokeWidth={1.75} />}
          title="Online"
          blurb="A frontier model through your own OpenRouter account."
          state={
            onlineReady
              ? {
                  kind: 'ready',
                  label: onlineCatalog.length > 0 ? `${onlineCatalog.length} models available` : 'Ready'
                }
              : online?.enabled
                ? { kind: 'action', label: 'Needs your API key' }
                : { kind: 'off', label: 'Off' }
          }
          onClick={() => onPick('online')}
        />
      </div>
    </div>
  )
}

type OptionState = { kind: 'ready' | 'action' | 'off'; label: string }

function Option({
  icon,
  title,
  blurb,
  state,
  onClick
}: {
  icon: React.ReactNode
  title: string
  blurb: string
  state: OptionState
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-xl border border-border bg-bg-elevated px-4 py-3.5 text-left hover:bg-nav-active"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-text">{title}</span>
        <span className="mt-0.5 block text-[12px] text-text-muted">{blurb}</span>
      </span>
      <StatusPill state={state} />
      <ChevronRight
        size={15}
        strokeWidth={2}
        className="shrink-0 text-text-muted/50 group-hover:text-text-muted"
      />
    </button>
  )
}

function StatusPill({ state }: { state: OptionState }) {
  const tone =
    state.kind === 'ready'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
      : state.kind === 'action'
        ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
        : 'border-border bg-bg text-text-muted'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] ${tone}`}
    >
      {state.kind === 'ready' && <Check size={10} strokeWidth={2.5} />}
      {state.label}
    </span>
  )
}

// ---------------- Step 2 ----------------

function PanelHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-elevated text-text-muted hover:text-text"
      >
        <ArrowLeft size={15} strokeWidth={1.75} />
      </button>
      <h1 className="flex-1 font-serif text-[22px] font-medium leading-tight tracking-tight text-text">
        {title}
      </h1>
      {right}
    </div>
  )
}

function LocalPanel({ onBack }: { onBack: () => void }) {
  const status = useChatStore((s) => s.status)
  const catalog = useChatStore((s) => s.catalog)
  const installed = useChatStore((s) => s.installed)
  const selectModel = useChatStore((s) => s.selectModel)
  const removeModel = useChatStore((s) => s.removeModel)
  const refresh = useChatStore((s) => s.refresh)
  const [checking, setChecking] = useState(false)

  const catalogIds = new Set(catalog.map((m) => m.id))
  const extras = installed.filter((m) => !catalogIds.has(m.id))
  const running = status?.running === true

  async function handleCheck() {
    setChecking(true)
    await refresh()
    setChecking(false)
  }

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <PanelHeader
        title="Run on this Mac"
        onBack={onBack}
        right={
          status && running ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 py-1 text-[10.5px] text-text-muted">
              <Cpu size={10} strokeWidth={2} />
              {status.hardware.arch === 'arm64' ? 'Apple Silicon' : 'Intel'} ·{' '}
              {status.hardware.totalRamGB} GB
            </span>
          ) : undefined
        }
      />

      {running ? (
        <>
          <div className="flex flex-col gap-2.5">
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
              <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Also installed
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

          <p className="mt-4 text-center text-[11px] text-text-muted">
            Nothing here leaves your Mac.{' '}
            <button
              type="button"
              onClick={() => void window.api.ollama.openExternal('https://ollama.com/library')}
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-text hover:underline"
            >
              Browse more models
              <ExternalLink size={9} strokeWidth={2} />
            </button>
          </p>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <h2 className="text-[14px] font-medium text-text">Ollama isn’t running</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            It runs open-source models directly on your Mac, so chat works without sending
            anything over the network. Free, ~150 MB.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void window.api.ollama.openExternal('https://ollama.com/download')}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
            >
              <Download size={12} strokeWidth={2} />
              Download Ollama
              <ExternalLink size={10} strokeWidth={2} className="opacity-70" />
            </button>
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-50"
            >
              <RefreshCw size={12} strokeWidth={2} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking…' : 'Check again'}
            </button>
          </div>
          <p className="mt-3 text-[11.5px] text-text-muted">
            After installing, open Ollama once so it can start its background service.
          </p>
        </div>
      )}
    </div>
  )
}

function OnlinePanel({ onBack }: { onBack: () => void }) {
  const online = useChatStore((s) => s.online)
  const selectModel = useChatStore((s) => s.selectModel)
  const ready = online?.enabled === true && online.hasKey

  return (
    <div className="mx-auto max-w-[720px] pb-10">
      <PanelHeader title="Run online" onBack={onBack} />

      {ready ? (
        <OnlineModelList onSelect={(id) => selectModel('openrouter', id)} />
      ) : (
        <div className="rounded-xl border border-border bg-bg-elevated p-5">
          <h2 className="text-[14px] font-medium text-text">
            {online?.enabled ? 'Add your OpenRouter API key' : 'Online AI is off'}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            {online?.enabled
              ? 'Online AI is on, but no key is saved yet.'
              : 'Off by default. Turn it on and add your own OpenRouter key. Only the messages you type and the decisions you attach are sent — never your whole journal.'}
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-flex rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
          >
            Open Settings → Online AI
          </Link>
        </div>
      )}
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
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[12.5px] text-text">{model.id}</span>
        <span className="ml-2 text-[10.5px] text-text-muted">
          {model.parameterSize ?? '?'} · {sizeGB} GB
        </span>
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
