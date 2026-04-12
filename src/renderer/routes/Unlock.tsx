import { useEffect, useRef, useState } from 'react'
import { Fingerprint, Lock } from 'lucide-react'
import PinPad from '../components/PinPad'
import ThemeToggle from '../components/ThemeToggle'
import { useAuthStore } from '../store/auth'

type Mode = 'enter' | 'create-first' | 'create-confirm' | 'offer-touchid' | 'restore-pin'

export default function Unlock() {
  const status = useAuthStore((s) => s.status)!
  const markUnlocked = useAuthStore((s) => s.markUnlocked)
  const refreshStatus = useAuthStore((s) => s.refreshStatus)

  const initialMode: Mode = status.initialized ? 'enter' : 'create-first'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [pin, setPin] = useState('')
  const [firstPin, setFirstPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [restoreFolder, setRestoreFolder] = useState<string | null>(null)
  const touchIdAutoPromptedRef = useRef(false)

  useEffect(() => {
    if (!status.cooldownUntil) return
    const tick = () => {
      const remaining = Math.max(0, status.cooldownUntil! - Date.now())
      setCooldownRemaining(remaining)
      if (remaining === 0) refreshStatus()
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [status.cooldownUntil, refreshStatus])

  useEffect(() => {
    if (mode !== 'enter') return
    if (touchIdAutoPromptedRef.current) return
    if (!status.touchIdEnabled || !status.touchIdAvailable) return
    if (status.cooldownUntil && status.cooldownUntil > Date.now()) return
    touchIdAutoPromptedRef.current = true
    void handleTouchId()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, status.touchIdEnabled, status.touchIdAvailable])

  const locked = cooldownRemaining > 0

  async function handleEnter() {
    if (busy || locked) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.unlock(pin)
    setBusy(false)
    if (res.ok) {
      markUnlocked()
      return
    }
    setPin('')
    if (res.error === 'cooldown') setError('Too many attempts. Please wait.')
    else if (res.error === 'wrong-pin') setError('Incorrect PIN')
    else if (res.error === 'invalid-format') setError('PIN must be 6 digits')
    else setError('Something went wrong')
    refreshStatus()
  }

  async function handleCreateFirst() {
    if (pin.length !== 6) return
    setFirstPin(pin)
    setPin('')
    setMode('create-confirm')
    setError(null)
  }

  async function handleCreateConfirm() {
    if (busy) return
    if (pin !== firstPin) {
      setPin('')
      setError("PINs don't match. Try again.")
      setMode('create-first')
      setFirstPin('')
      return
    }
    setBusy(true)
    setError(null)
    const res = await window.api.vault.create(firstPin)
    setBusy(false)
    if (!res.ok) {
      setError('Failed to create vault')
      setMode('create-first')
      setFirstPin('')
      setPin('')
      return
    }
    setFirstPin('')
    setPin('')
    if (status.touchIdAvailable) {
      setMode('offer-touchid')
    } else {
      markUnlocked()
    }
  }

  async function handleEnableTouchIdFromOffer() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.enableTouchIdCurrentSession()
    setBusy(false)
    if (res.ok) {
      await refreshStatus()
      markUnlocked()
    } else {
      setError(res.error ?? 'Could not enable Touch ID')
    }
  }

  function handleSkipTouchId() {
    markUnlocked()
  }

  async function handleStartRestore() {
    if (busy) return
    setError(null)
    const folder = await window.api.vault.pickImportFolder()
    if (!folder) return
    setRestoreFolder(folder)
    setPin('')
    setMode('restore-pin')
  }

  async function handleRestoreSubmit() {
    if (busy || !restoreFolder) return
    if (pin.length !== 6) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.import(restoreFolder, pin)
    setBusy(false)
    if (res.ok) {
      await refreshStatus()
      markUnlocked()
      return
    }
    setPin('')
    if (res.error === 'wrong-pin') {
      setError('Incorrect PIN for this backup')
    } else if (res.error === 'invalid-folder') {
      setError('That folder is not a Decision Journal backup')
      setRestoreFolder(null)
      setMode('create-first')
    } else if (res.error === 'db-exists') {
      setError('A vault already exists on this Mac')
      setRestoreFolder(null)
      setMode('create-first')
    } else {
      setError('Restore failed')
      setRestoreFolder(null)
      setMode('create-first')
    }
  }

  function handleCancelRestore() {
    setRestoreFolder(null)
    setPin('')
    setError(null)
    setMode('create-first')
  }

  async function handleTouchId() {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.unlockWithTouchId()
    setBusy(false)
    if (res.ok) {
      markUnlocked()
    } else {
      // Silent fallback to PIN entry; don't spam errors.
    }
  }

  const heading =
    mode === 'enter'
      ? 'Welcome back'
      : mode === 'create-first'
        ? 'Create your PIN'
        : mode === 'create-confirm'
          ? 'Confirm your PIN'
          : mode === 'restore-pin'
            ? 'Restore from backup'
            : 'Enable Touch ID'

  const subtitle =
    mode === 'enter'
      ? 'Enter your 6-digit PIN to unlock your journal'
      : mode === 'create-first'
        ? 'Choose a 6-digit PIN. This is the only way to decrypt your data — do not forget it.'
        : mode === 'create-confirm'
          ? 'Enter the same 6 digits again to confirm'
          : mode === 'restore-pin'
            ? 'Enter the PIN that was used when this backup was created.'
            : 'Unlock your journal with your fingerprint. Your PIN will still work as a fallback.'

  const onSubmit =
    mode === 'enter'
      ? handleEnter
      : mode === 'create-first'
        ? handleCreateFirst
        : mode === 'create-confirm'
          ? handleCreateConfirm
          : mode === 'restore-pin'
            ? handleRestoreSubmit
            : undefined

  const cooldownSec = Math.ceil(cooldownRemaining / 1000)

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-bg text-text">
      <div className="drag-region absolute inset-x-0 top-0 h-[52px]" />
      <div className="no-drag absolute right-4 top-3">
        <ThemeToggle />
      </div>

      <div className="no-drag flex w-full max-w-sm flex-col items-center px-6">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-bg-elevated text-text">
          {mode === 'offer-touchid' ? (
            <Fingerprint size={20} strokeWidth={1.75} />
          ) : (
            <Lock size={18} strokeWidth={1.75} />
          )}
        </div>

        <h1 className="font-serif text-[28px] font-medium tracking-tight text-text">
          {heading}
        </h1>
        <p className="mt-2 max-w-xs text-center text-[13px] leading-relaxed text-text-muted">
          {subtitle}
        </p>

        {mode !== 'offer-touchid' ? (
          <div className="mt-8">
            <PinPad
              value={pin}
              onChange={(v) => {
                setError(null)
                setPin(v)
              }}
              onSubmit={onSubmit}
              disabled={busy || locked}
            />
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleEnableTouchIdFromOffer}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-5 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
            >
              <Fingerprint size={15} strokeWidth={2} />
              Enable Touch ID
            </button>
            <button
              type="button"
              onClick={handleSkipTouchId}
              disabled={busy}
              className="rounded-lg px-5 py-2 text-[12.5px] text-text-muted hover:text-text"
            >
              Skip for now
            </button>
          </div>
        )}

        <div className="mt-4 h-5 text-[12.5px]">
          {locked ? (
            <span className="text-text-muted">Locked — try again in {cooldownSec}s</span>
          ) : error ? (
            <span className="text-red-500/90">{error}</span>
          ) : status.failedAttempts > 0 && mode === 'enter' ? (
            <span className="text-text-muted">
              {status.failedAttempts} failed attempt{status.failedAttempts === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {mode === 'enter' && status.touchIdEnabled && status.touchIdAvailable && (
          <button
            type="button"
            onClick={handleTouchId}
            disabled={busy || locked}
            className="mt-2 flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-4 py-2 text-[13px] text-text hover:bg-nav-active disabled:opacity-50"
          >
            <Fingerprint size={15} strokeWidth={1.75} />
            Unlock with Touch ID
          </button>
        )}

        {mode === 'create-first' && (
          <button
            type="button"
            onClick={handleStartRestore}
            disabled={busy}
            className="mt-2 text-[12.5px] text-text-muted underline decoration-dotted underline-offset-4 hover:text-text disabled:opacity-50"
          >
            Restore from backup instead
          </button>
        )}

        {mode === 'restore-pin' && (
          <button
            type="button"
            onClick={handleCancelRestore}
            disabled={busy}
            className="mt-2 text-[12.5px] text-text-muted underline decoration-dotted underline-offset-4 hover:text-text disabled:opacity-50"
          >
            Cancel restore
          </button>
        )}

        <p className="mt-10 text-center text-[11.5px] text-text-muted">
          All data stored locally · Zero network requests
        </p>
      </div>
    </div>
  )
}
