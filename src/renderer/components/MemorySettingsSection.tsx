import { useEffect, useState } from 'react'
import { Brain, Cpu } from 'lucide-react'
import type { OnlineModel } from '@shared/ai'
import type { MemorySettings } from '@shared/memory'
import { useMemoryStore } from '../store/memory'
import MemoryConsentModal from './MemoryConsentModal'

/**
 * Settings → Memory. Separate from online chat on purpose: extraction sends a
 * decision automatically after a save, rather than only when the user presses
 * send, so it needs its own decision.
 */
export default function MemorySettingsSection({ highlighted }: { highlighted?: boolean }) {
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [models, setModels] = useState<OnlineModel[]>([])
  const [showConsent, setShowConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const refreshStore = useMemoryStore((s) => s.refresh)

  useEffect(() => {
    void window.api.memory.getSettings().then(setSettings)
    void window.api.ai.catalog().then((c) => setModels(c.models))
  }, [])

  async function handleToggle(next: boolean) {
    if (next) {
      setShowConsent(true)
      return
    }
    setBusy(true)
    setSettings(await window.api.memory.setEnabled(false))
    await refreshStore()
    setBusy(false)
  }

  async function handleAccept() {
    setShowConsent(false)
    setBusy(true)
    setSettings(await window.api.memory.setEnabled(true))
    await refreshStore()
    setBusy(false)
  }

  async function handleModel(modelId: string) {
    setBusy(true)
    setSettings(await window.api.memory.setModel(modelId))
    setBusy(false)
  }

  if (!settings) return null

  // Structured output is how proposals come back in a validatable shape.
  const usable = models.filter((m) => m.supportsStructuredOutputs)

  return (
    <section
      id="settings-memory"
      className={[
        'mt-8 scroll-mt-6 rounded-xl transition-shadow',
        highlighted ? 'shadow-[0_0_0_3px_rgb(var(--accent)/0.35)]' : ''
      ].join(' ')}
    >
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
        Memory (optional)
      </h2>
      <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
        Lets the coach carry context between conversations — your stated goals, constraints,
        tradeoffs and lessons. Proposals are stored encrypted on this Mac and are only used once
        you approve them.
      </p>

      <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-bg-elevated">
        <Row
          icon={<Brain size={16} strokeWidth={1.75} />}
          title="Extract memories from new decisions"
          subtitle={
            settings.blockedByOnlineDisabled
              ? 'Needs online AI, which is currently off.'
              : settings.enabled
                ? `On. ${settings.approvedCount} approved, ${settings.pendingCount} waiting for review.`
                : 'Off. Nothing is sent for extraction.'
          }
          right={
            <Toggle
              checked={settings.enabled}
              disabled={busy || settings.blockedByOnlineDisabled}
              onChange={handleToggle}
            />
          }
        />

        {settings.enabled && (
          <Row
            icon={<Cpu size={16} strokeWidth={1.75} />}
            title="Extraction model"
            subtitle="Fixed here rather than following whichever model Chat happens to have open."
            right={
              <select
                value={settings.modelId}
                onChange={(e) => void handleModel(e.target.value)}
                disabled={busy}
                className="max-w-[220px] rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] text-text focus:outline-none disabled:opacity-50"
              >
                <option value={settings.modelId}>{settings.modelId}</option>
                {usable
                  .filter((m) => m.id !== settings.modelId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            }
          />
        )}
      </div>

      {showConsent && (
        <MemoryConsentModal onCancel={() => setShowConsent(false)} onAccept={handleAccept} />
      )}
    </section>
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
