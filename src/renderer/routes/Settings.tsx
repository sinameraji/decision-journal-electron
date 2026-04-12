import { useEffect, useState } from 'react'
import { Fingerprint, Lock, Mic, Download, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import PinPad from '../components/PinPad'
import { useAuthStore } from '../store/auth'
import { useTranscriptionStore } from '../store/transcription'
import type { WhisperModelInfo } from '@shared/ipc-contract'

export default function Settings() {
  const status = useAuthStore((s) => s.status)!
  const refreshStatus = useAuthStore((s) => s.refreshStatus)
  const lock = useAuthStore((s) => s.lock)

  const {
    availableModels,
    installedModels,
    activeModel,
    totalMemGB,
    downloadProgress,
    setDownloadProgress,
    refresh: refreshTranscription
  } = useTranscriptionStore()

  const [version, setVersion] = useState<string>('')
  const [pinModal, setPinModal] = useState<'enable-touchid' | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modelBusy, setModelBusy] = useState<string | null>(null)

  useEffect(() => {
    window.api.app.version().then(setVersion)
    refreshStatus()
    refreshTranscription()
  }, [refreshStatus, refreshTranscription])

  useEffect(() => {
    const unsub = window.api.transcription.onDownloadProgress((p) => {
      setDownloadProgress(p)
    })
    return unsub
  }, [setDownloadProgress])

  async function handleDownloadModel(name: string) {
    setModelBusy(name)
    try {
      await window.api.transcription.downloadModel(name)
      await refreshTranscription()
    } catch {
      // download cancelled or failed
    }
    setDownloadProgress(null)
    setModelBusy(null)
  }

  async function handleDeleteModel(name: string) {
    setModelBusy(name)
    await window.api.transcription.deleteModel(name)
    await refreshTranscription()
    setModelBusy(null)
  }

  async function handleSetActiveModel(name: string) {
    setModelBusy(name)
    await window.api.transcription.setActiveModel(name)
    await refreshTranscription()
    setModelBusy(null)
  }

  async function handleCancelDownload() {
    await window.api.transcription.cancelDownload()
    setDownloadProgress(null)
    setModelBusy(null)
  }

  async function handleToggleTouchId(next: boolean) {
    setError(null)
    if (next) {
      setPinModal('enable-touchid')
      setPin('')
      return
    }
    setBusy(true)
    const res = await window.api.vault.setTouchIdEnabled(false, '')
    setBusy(false)
    if (res.ok) await refreshStatus()
    else setError(res.error ?? 'Failed to disable Touch ID')
  }

  async function confirmEnableTouchId() {
    if (busy || pin.length !== 6) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.setTouchIdEnabled(true, pin)
    setBusy(false)
    setPin('')
    if (res.ok) {
      setPinModal(null)
      await refreshStatus()
    } else {
      setError(res.error ?? 'Failed to enable Touch ID')
    }
  }

  function cancelPinModal() {
    setPinModal(null)
    setPin('')
    setError(null)
  }

  return (
    <div className="mx-auto max-w-[780px] pb-10">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Settings
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Your data is encrypted on-device. Nothing leaves your Mac.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          Security
        </h2>

        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-bg-elevated">
          <Row
            icon={<Fingerprint size={16} strokeWidth={1.75} />}
            title="Unlock with Touch ID"
            subtitle={
              status.touchIdAvailable
                ? 'Use your fingerprint to unlock. Your PIN still works as a fallback.'
                : 'Touch ID is not available on this Mac.'
            }
            right={
              <Toggle
                checked={status.touchIdEnabled}
                disabled={!status.touchIdAvailable || busy}
                onChange={handleToggleTouchId}
              />
            }
          />
          <Row
            icon={<Lock size={16} strokeWidth={1.75} />}
            title="Lock now"
            subtitle="Close the database and return to the PIN screen."
            right={
              <button
                type="button"
                onClick={() => lock()}
                className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
              >
                Lock
              </button>
            }
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          Transcription
        </h2>
        <p className="mb-3 text-[12px] text-text-muted">
          Manage local speech-to-text models. Audio never leaves your device.
        </p>
        <div className="flex flex-col gap-2.5">
          {availableModels.map((m) => (
            <ModelRow
              key={m.name}
              model={m}
              isInstalled={installedModels.includes(m.name)}
              isActive={activeModel === m.name}
              isBusy={modelBusy === m.name}
              downloadProgress={
                downloadProgress && modelBusy === m.name ? downloadProgress : null
              }
              lowRamWarning={m.name === 'small.en' && totalMemGB < 8}
              onDownload={() => handleDownloadModel(m.name)}
              onDelete={() => handleDeleteModel(m.name)}
              onSetActive={() => handleSetActiveModel(m.name)}
              onCancelDownload={handleCancelDownload}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          About
        </h2>
        <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4 text-[13px]">
          <div className="flex justify-between text-text-muted">
            <span>Decision Journal</span>
            <span>v{version || '…'}</span>
          </div>
          <div className="mt-1 text-text-muted">Created by Sina Meraji</div>
        </div>
      </section>

      {pinModal === 'enable-touchid' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[360px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
            <h3 className="font-serif text-[20px] font-medium text-text">Enter your PIN</h3>
            <p className="mt-1 text-[12.5px] text-text-muted">
              Confirm your PIN to enable Touch ID.
            </p>
            <div className="mt-5">
              <PinPad
                value={pin}
                onChange={(v) => {
                  setError(null)
                  setPin(v)
                }}
                onSubmit={confirmEnableTouchId}
                disabled={busy}
              />
            </div>
            <div className="mt-3 h-5 text-center text-[12px] text-red-500/90">
              {error ?? '\u00a0'}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPinModal}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEnableTouchId}
                disabled={busy || pin.length !== 6}
                className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
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
      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium text-text">{title}</div>
        <div className="mt-0.5 text-[12px] text-text-muted">{subtitle}</div>
      </div>
      <div>{right}</div>
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-6 w-10 rounded-full border transition-colors',
        checked
          ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))]'
          : 'border-border bg-bg',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] h-[18px] w-[18px] rounded-full transition-transform',
          checked ? 'translate-x-[18px] bg-accent-text' : 'translate-x-[2px] bg-text'
        ].join(' ')}
      />
    </button>
  )
}

function ModelRow({
  model,
  isInstalled,
  isActive,
  isBusy,
  downloadProgress,
  lowRamWarning,
  onDownload,
  onDelete,
  onSetActive,
  onCancelDownload
}: {
  model: WhisperModelInfo
  isInstalled: boolean
  isActive: boolean
  isBusy: boolean
  downloadProgress: { loaded: number; total: number } | null
  lowRamWarning: boolean
  onDownload: () => void
  onDelete: () => void
  onSetActive: () => void
  onCancelDownload: () => void
}) {
  const isDownloading = downloadProgress !== null
  const pct =
    downloadProgress && downloadProgress.total > 0
      ? Math.round((downloadProgress.loaded / downloadProgress.total) * 100)
      : 0

  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Mic size={14} className="text-text-muted" />
            <span className="text-[13px] font-medium text-text">{model.label}</span>
            <span className="text-[12px] text-text-muted">{model.sizeLabel}</span>
            {isActive && (
              <span className="rounded-full bg-[rgb(var(--accent))]/10 px-2 py-0.5 text-[11px] font-medium text-[rgb(var(--accent))] dark:bg-text/10 dark:text-text">
                Active
              </span>
            )}
            {isInstalled && !isActive && (
              <span className="rounded-full bg-border px-2 py-0.5 text-[11px] font-medium text-text-muted">
                Installed
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-text-muted">{model.description}</p>
          {lowRamWarning && (
            <span className="mt-1 flex items-center gap-1 text-[11.5px] text-amber-500">
              <AlertTriangle size={12} />
              Your Mac has less than 8 GB RAM — this model may run slowly.
            </span>
          )}
        </div>

        <div className="ml-4 flex shrink-0 items-center gap-2">
          {isDownloading ? (
            <button
              type="button"
              onClick={onCancelDownload}
              className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text-muted hover:text-text"
            >
              Cancel
            </button>
          ) : isInstalled ? (
            <>
              {!isActive && (
                <button
                  type="button"
                  onClick={onSetActive}
                  disabled={isBusy}
                  className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] text-accent-text hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
                >
                  {isBusy ? <Loader2 size={13} className="animate-spin" /> : 'Set Active'}
                </button>
              )}
              {!isActive && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isBusy}
                  className="flex items-center gap-1 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-red-500/80 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onDownload}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] text-accent-text hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
            >
              {isBusy ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Download size={13} />
              )}
              Download
            </button>
          )}
        </div>
      </div>

      {isDownloading && (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            <Loader2 size={13} className="animate-spin" />
            Downloading... {pct}%
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-200 dark:bg-text"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
