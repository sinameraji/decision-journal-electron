import { useState } from 'react'
import PinPad from './PinPad'

type Step = 'current' | 'new' | 'confirm'

interface Props {
  onClose: () => void
}

export default function ChangePinModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function handleCurrentSubmit() {
    if (currentPin.length !== 6) return
    setError(null)
    setStep('new')
  }

  function handleNewSubmit() {
    if (newPin.length !== 6) return
    if (newPin === currentPin) {
      setError('New PIN must be different from your current PIN')
      setNewPin('')
      return
    }
    setError(null)
    setStep('confirm')
  }

  async function handleConfirmSubmit() {
    if (busy) return
    if (confirmPin !== newPin) {
      setError("PINs don't match. Try again.")
      setNewPin('')
      setConfirmPin('')
      setStep('new')
      return
    }
    setBusy(true)
    setError(null)
    const res = await window.api.vault.changePin(currentPin, newPin)
    setBusy(false)
    if (!res.ok) {
      setError(res.error === 'wrong-pin' ? 'Current PIN is incorrect' : 'Failed to change PIN')
      setStep('current')
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      return
    }
    setDone(true)
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
  }

  const heading = done
    ? 'PIN changed'
    : step === 'current'
      ? 'Enter current PIN'
      : step === 'new'
        ? 'Choose a new PIN'
        : 'Confirm new PIN'

  const subtitle = done
    ? 'Your new PIN will be required the next time you unlock.'
    : step === 'current'
      ? 'We need to verify your current PIN first.'
      : step === 'new'
        ? 'Choose a new 6-digit PIN. This is the only way to decrypt your data — do not forget it.'
        : 'Enter the same 6 digits again to confirm.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">{heading}</h3>
        <p className="mt-1 text-[12.5px] text-text-muted">{subtitle}</p>

        {!done && (
          <div className="mt-5">
            {step === 'current' && (
              <PinPad
                value={currentPin}
                onChange={(v) => {
                  setError(null)
                  setCurrentPin(v)
                }}
                onSubmit={handleCurrentSubmit}
                disabled={busy}
              />
            )}
            {step === 'new' && (
              <PinPad
                value={newPin}
                onChange={(v) => {
                  setError(null)
                  setNewPin(v)
                }}
                onSubmit={handleNewSubmit}
                disabled={busy}
              />
            )}
            {step === 'confirm' && (
              <PinPad
                value={confirmPin}
                onChange={(v) => {
                  setError(null)
                  setConfirmPin(v)
                }}
                onSubmit={handleConfirmSubmit}
                disabled={busy}
              />
            )}
          </div>
        )}

        <div className="mt-3 h-5 text-center text-[12px] text-red-500/90">{error ?? '\u00a0'}</div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            {done ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
