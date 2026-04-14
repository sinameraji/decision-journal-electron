import { useEffect, useState } from 'react'
import { Fingerprint, Lock, Mic, Download, Trash2, Loader2, CheckCircle2, AlertTriangle, HardDriveDownload, Heart, RefreshCw } from 'lucide-react'
import PinPad from '../components/PinPad'
import SupportModal from '../components/SupportModal'
import { useAuthStore } from '../store/auth'
import { useTranscriptionStore } from '../store/transcription'
import type { WhisperModelInfo, UpdateStatus } from '@shared/ipc-contract'

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
  const [pinModal, setPinModal] = useState<'enable-touchid' | 'restore-confirm' | 'restore-pin' | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [restoreFolder, setRestoreFolder] = useState<string | null>(null)
  const [modelBusy, setModelBusy] = useState<string | null>(null)
  const [justDeleted, setJustDeleted] = useState<string | null>(null)
  const [showSupport, setShowSupport] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [autoUpdateEnabled, setAutoUpdateEnabledState] = useState<boolean>(true)

  useEffect(() => {
    window.api.app.version().then(setVersion)
    window.api.app.getAutoUpdateEnabled().then(setAutoUpdateEnabledState)
    refreshStatus()
    refreshTranscription()
  }, [refreshStatus, refreshTranscription])

  async function handleToggleAutoUpdate(next: boolean) {
    setAutoUpdateEnabledState(next)
    await window.api.app.setAutoUpdateEnabled(next)
  }

  useEffect(() => {
    const unsub = window.api.app.onUpdateStatus(setUpdateStatus)
    return unsub
  }, [])

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
    setJustDeleted(name)
    setTimeout(() => setJustDeleted(null), 1500)
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

  async function handleStartRestore() {
    if (busy) return
    setError(null)
    const folder = await window.api.vault.pickImportFolder()
    if (!folder) return
    setRestoreFolder(folder)
    setPinModal('restore-confirm')
  }

  function handleRestoreConfirm() {
    setPin('')
    setError(null)
    setPinModal('restore-pin')
  }

  async function handleRestoreSubmit() {
    if (busy || pin.length !== 6 || !restoreFolder) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.replaceFromBackup(restoreFolder, pin)
    setBusy(false)
    if (res.ok) {
      setPinModal(null)
      setPin('')
      setRestoreFolder(null)
      await lock()
    } else {
      setPin('')
      if (res.error === 'wrong-pin') setError('Incorrect PIN for this backup')
      else if (res.error === 'invalid-folder') setError('Not a valid Decision Journal backup')
      else setError('Restore failed. Your current vault has been preserved.')
    }
  }

  function cancelPinModal() {
    setPinModal(null)
    setPin('')
    setError(null)
    setRestoreFolder(null)
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
          <Row
            icon={<HardDriveDownload size={16} strokeWidth={1.75} />}
            title="Restore from backup"
            subtitle="Replace your vault and all decisions with a previous backup."
            right={
              <button
                type="button"
                onClick={handleStartRestore}
                disabled={busy}
                className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-50"
              >
                Restore…
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
              justDeleted={justDeleted === m.name}
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
          <div className="mt-1 text-text-muted">
            Inspired by{' '}
            <button
              type="button"
              onClick={() =>
                window.api.app.openExternal('https://fs.blog/decision-journal/')
              }
              className="underline underline-offset-2 hover:text-text"
            >
              Farnam Street's decision journal
            </button>{' '}
            practice.
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <div className="text-[13px] text-text">Check for updates automatically</div>
                <div className="mt-0.5 text-[11.5px] text-text-muted">
                  Contacts github.com once per launch. Turn off to stay fully offline.
                </div>
              </div>
              <Toggle checked={autoUpdateEnabled} onChange={handleToggleAutoUpdate} />
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <UpdateRow status={updateStatus} />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          Support
        </h2>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-bg-elevated px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-bg text-text">
            <Heart size={16} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-text">Support this project</div>
            <div className="mt-0.5 text-[12px] text-text-muted">
              Free and open source, built independently. Donations help keep it going.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSupport(true)}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
          >
            Donate
          </button>
        </div>
      </section>

      {showSupport && <SupportModal onClose={() => setShowSupport(false)} />}

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

      {pinModal === 'restore-confirm' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
            <h3 className="font-serif text-[20px] font-medium text-text">Replace your vault?</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-text-muted">
              This will permanently replace all your current decisions and data with the
              contents of the selected backup. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPinModal}
                className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestoreConfirm}
                className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-[12.5px] font-medium text-red-500 hover:bg-red-500/20"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {pinModal === 'restore-pin' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-[360px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
            <h3 className="font-serif text-[20px] font-medium text-text">Enter backup PIN</h3>
            <p className="mt-1 text-[12.5px] text-text-muted">
              Enter the PIN that was used when this backup was created.
            </p>
            <div className="mt-5">
              <PinPad
                value={pin}
                onChange={(v) => {
                  setError(null)
                  setPin(v)
                }}
                onSubmit={handleRestoreSubmit}
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
                onClick={handleRestoreSubmit}
                disabled={busy || pin.length !== 6}
                className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
              >
                {busy ? 'Restoring…' : 'Restore'}
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
          checked ? 'translate-x-[16px] bg-white dark:bg-bg' : 'translate-x-0 bg-white',
        ].join(' ')}
      />
    </label>
  )
}

function UpdateRow({ status }: { status: UpdateStatus }) {
  const checking = status.state === 'checking'
  const downloading = status.state === 'downloading'

  if (status.state === 'downloaded') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-green-600 dark:text-green-400">
          v{status.version} ready to install
        </span>
        <button
          type="button"
          onClick={() => window.api.app.installUpdate()}
          className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] text-accent-text hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text"
        >
          Restart & Update
        </button>
      </div>
    )
  }

  if (status.state === 'available') {
    return (
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-text-muted">
          v{status.version} available
        </span>
        <button
          type="button"
          onClick={() => window.api.app.downloadUpdate()}
          className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] text-accent-text hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text"
        >
          Download Update
        </button>
      </div>
    )
  }

  if (downloading) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[12px] text-text-muted">
          <Loader2 size={13} className="animate-spin" />
          Downloading update... {status.percent}%
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-200 dark:bg-text"
            style={{ width: `${status.percent}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-text-muted">
        {status.state === 'error'
          ? 'Could not check for updates'
          : status.state === 'not-available'
            ? "You're on the latest version"
            : checking
              ? 'Checking for updates…'
              : 'Check for updates'}
      </span>
      <button
        type="button"
        onClick={() => window.api.app.checkForUpdates()}
        disabled={checking}
        className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active disabled:opacity-50"
      >
        <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
        {checking ? 'Checking…' : 'Check'}
      </button>
    </div>
  )
}

function ModelRow({
  model,
  isInstalled,
  isActive,
  isBusy,
  justDeleted,
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
  justDeleted: boolean
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
          {justDeleted ? (
            <span className="flex items-center gap-1 text-[12px] text-green-600 dark:text-green-400">
              <CheckCircle2 size={13} />
              Deleted
            </span>
          ) : isDownloading ? (
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
              <button
                type="button"
                onClick={onDelete}
                disabled={isBusy}
                className="flex items-center gap-1 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-red-500/80 hover:text-red-500 disabled:opacity-50"
              >
                <Trash2 size={12} />
                Delete
              </button>
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
