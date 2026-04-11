import { useEffect, useRef, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import PinPad from './PinPad'
import { useAuthStore } from '../store/auth'

interface ReauthModalProps {
  title: string
  description: string
  confirmLabel: string
  reason: string
  danger?: boolean
  onCancel: () => void
  onConfirmed: () => void | Promise<void>
}

export default function ReauthModal({
  title,
  description,
  confirmLabel,
  reason,
  danger,
  onCancel,
  onConfirmed
}: ReauthModalProps) {
  const status = useAuthStore((s) => s.status)
  const touchIdReady =
    !!status && status.touchIdAvailable && status.touchIdEnabled

  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const touchIdTriedRef = useRef(false)

  useEffect(() => {
    if (!touchIdReady || touchIdTriedRef.current) return
    touchIdTriedRef.current = true
    void handleTouchId()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchIdReady])

  async function handleTouchId() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await window.api.vault.promptTouchIdForAction(reason)
      if (res.ok) {
        await onConfirmed()
      }
      // On cancel / failure, user falls through to PIN entry silently.
    } finally {
      setBusy(false)
    }
  }

  async function handlePin() {
    if (busy || pin.length !== 6) return
    setBusy(true)
    setError(null)
    const res = await window.api.vault.verifyPin(pin)
    if (!res.ok) {
      setBusy(false)
      setPin('')
      if (res.error === 'cooldown') setError('Too many attempts. Try again later.')
      else if (res.error === 'invalid-format') setError('PIN must be 6 digits')
      else setError('Incorrect PIN')
      return
    }
    try {
      await onConfirmed()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">{title}</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{description}</p>

        <div className="mt-5 flex flex-col items-center gap-4">
          <p className="text-[12.5px] text-text-muted">
            Confirm with your {touchIdReady ? 'fingerprint or ' : ''}PIN
          </p>
          <PinPad
            value={pin}
            onChange={(v) => {
              setError(null)
              setPin(v)
            }}
            onSubmit={handlePin}
            disabled={busy}
          />
          {touchIdReady && (
            <button
              type="button"
              onClick={handleTouchId}
              disabled={busy}
              className="flex items-center gap-2 rounded-full border border-border bg-bg px-4 py-1.5 text-[12.5px] text-text hover:bg-nav-active disabled:opacity-50"
            >
              <Fingerprint size={14} strokeWidth={1.75} />
              Use Touch ID
            </button>
          )}
        </div>

        <div className="mt-4 h-5 text-center text-[12px]">
          {error ? <span className="text-red-500/90">{error}</span> : <span>&nbsp;</span>}
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePin}
            disabled={busy || pin.length !== 6}
            className={[
              'rounded-md border px-3 py-1.5 text-[12.5px]',
              danger
                ? 'border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20 disabled:opacity-40'
                : 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 disabled:opacity-40 dark:bg-transparent dark:border-border dark:text-text'
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
