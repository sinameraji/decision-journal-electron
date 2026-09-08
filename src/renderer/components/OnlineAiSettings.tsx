import { useEffect, useState } from 'react'
import { Globe, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import type { OnlineSettings } from '@shared/ai'
import { useChatStore } from '../store/chat'

/**
 * Settings → Online AI. Off on fresh installs and on upgrade; turning it on
 * requires reading the disclosure, and the key is write-only once saved.
 */
export default function OnlineAiSettings() {
  const [settings, setSettings] = useState<OnlineSettings | null>(null)
  const [showConsent, setShowConsent] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const refreshChatStore = useChatStore((s) => s.refreshOnline)

  useEffect(() => {
    void window.api.ai.getSettings().then(setSettings)
  }, [])

  async function apply(next: Promise<OnlineSettings>) {
    setBusy(true)
    setError(null)
    try {
      setSettings(await next)
      await refreshChatStore()
    } finally {
      setBusy(false)
    }
  }

  async function handleToggle(next: boolean) {
    if (next) {
      setShowConsent(true)
      return
    }
    await apply(window.api.ai.setEnabled(false))
    setNotice('Online AI is off. Anything that was in flight was cancelled.')
  }

  async function handleAcceptConsent() {
    setShowConsent(false)
    await apply(window.api.ai.setEnabled(true))
    setNotice(null)
  }

  async function handleSaveKey() {
    setBusy(true)
    setError(null)
    const res = await window.api.ai.setApiKey(keyInput)
    if (!res.ok) {
      setError(res.error ?? 'Could not save the key.')
      setBusy(false)
      return
    }
    // Clear the pasted secret from renderer memory immediately; it is never
    // read back from the main process.
    setKeyInput('')
    setEditingKey(false)
    setSettings(await window.api.ai.getSettings())
    await refreshChatStore()
    setBusy(false)
    setNotice('Key saved to your macOS Keychain. It is not included in backups.')
  }

  async function handleRemoveKey() {
    await apply(window.api.ai.clearApiKey())
    setNotice('Key removed and online AI turned off.')
  }

  async function handleRefreshCatalog() {
    setBusy(true)
    setError(null)
    const res = await window.api.ai.refreshCatalog()
    if (!res.ok) setError(res.message)
    else setNotice(`Loaded ${res.catalog.models.length} models with a zero-data-retention route.`)
    setSettings(await window.api.ai.getSettings())
    await refreshChatStore()
    setBusy(false)
  }

  if (!settings) return null

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
        Online AI (optional)
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
        Decision Journal runs on your Mac. Turning this on lets you chat with an online model
        through <span className="font-medium text-text">your own</span> OpenRouter account. Your
        journal is never uploaded — only the messages you type and the decisions you explicitly
        attach to a chat.
      </p>

      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-bg-elevated">
        <Row
          icon={<Globe size={16} strokeWidth={1.75} />}
          title="Enable online AI"
          subtitle={
            settings.enabled
              ? 'On. Chats using an online model leave this Mac.'
              : 'Off. Everything stays on this Mac.'
          }
          right={<Toggle checked={settings.enabled} disabled={busy} onChange={handleToggle} />}
        />

        <Row
          icon={<KeyRound size={16} strokeWidth={1.75} />}
          title="OpenRouter API key"
          subtitle={
            settings.hasKey
              ? `Saved in your macOS Keychain — ends in ${settings.keyHint}. Usage is billed to your OpenRouter account.`
              : 'Not set. The key is stored in the Keychain and never included in a backup.'
          }
          right={
            editingKey ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-or-…"
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="w-[190px] rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-[11.5px] text-text placeholder:text-text-muted focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setKeyInput('')
                    setEditingKey(false)
                    setError(null)
                  }}
                  className="rounded-md px-2 py-1.5 text-[12px] text-text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={busy || !keyInput.trim()}
                  className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-2.5 py-1.5 text-[12px] text-accent-text hover:opacity-90 disabled:opacity-50 dark:border-border dark:bg-transparent dark:text-text"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {settings.hasKey && (
                  <button
                    type="button"
                    onClick={handleRemoveKey}
                    disabled={busy}
                    className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text-muted hover:text-red-500 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingKey(true)}
                  disabled={busy}
                  className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-50"
                >
                  {settings.hasKey ? 'Replace' : 'Add key'}
                </button>
              </div>
            )
          }
        />

        {settings.enabled && settings.hasKey && (
          <Row
            icon={<RefreshCw size={16} strokeWidth={1.75} />}
            title="Model catalog"
            subtitle={
              settings.catalogFetchedAt
                ? `Last refreshed ${new Date(settings.catalogFetchedAt).toLocaleString()}. Default: ${settings.defaultModel}`
                : 'Not loaded yet. Refresh to see which models are available.'
            }
            right={
              <button
                type="button"
                onClick={handleRefreshCatalog}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={12} strokeWidth={2} className="animate-spin" />
                ) : (
                  <RefreshCw size={12} strokeWidth={2} />
                )}
                Refresh
              </button>
            }
          />
        )}
      </div>

      {(error || notice) && (
        <div
          className={[
            'mt-3 rounded-lg border px-3 py-2 text-[12px]',
            error
              ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
              : 'border-border bg-bg-elevated text-text-muted'
          ].join(' ')}
        >
          {error ?? notice}
        </div>
      )}

      {settings.enabled && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-[11.5px] leading-relaxed text-text-muted">
          <ShieldCheck size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            Requests are restricted to zero-data-retention routes with provider training refused,
            and response caching is turned off. OpenRouter still records request metadata, and
            downstream providers have their own policies — we cannot promise an online request
            leaves no logs anywhere.
          </span>
        </div>
      )}

      {showConsent && (
        <ConsentModal onCancel={() => setShowConsent(false)} onAccept={handleAcceptConsent} />
      )}
    </section>
  )
}

function ConsentModal({ onCancel, onAccept }: { onCancel: () => void; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[460px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Turn on online AI?</h3>
        <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-text-muted">
          <p>
            Decision Journal runs on your Mac. If you enable online AI, the messages and decision
            context you choose will be sent to OpenRouter and the model provider.
          </p>
          <p>
            We do not host your journal or operate the AI service. Bring your own OpenRouter API
            key; usage is billed to your OpenRouter account. Your local journal stays encrypted.
            Data sent for online processing is subject to those services’ policies.
          </p>
          <p>
            Local chat, and every other feature, keeps working without this. You can turn it off
            at any time.
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
            className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
          >
            I understand — turn it on
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({
  icon,
  title,
  subtitle,
  right
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  right: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-bg text-text">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-text">{title}</div>
        <div className="mt-0.5 text-[12px] text-text-muted">{subtitle}</div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  )
}

function Toggle({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      className={[
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors',
        checked
          ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] dark:border-text dark:bg-text'
          : 'border-border bg-border/50',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      ].join(' ')}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(!checked)}
      />
      <span
        className={[
          'pointer-events-none absolute left-[2px] h-[18px] w-[18px] rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-[16px] bg-white dark:bg-bg' : 'translate-x-0 bg-white'
        ].join(' ')}
      />
    </label>
  )
}
