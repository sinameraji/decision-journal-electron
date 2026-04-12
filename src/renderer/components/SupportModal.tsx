import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import QRCode from 'qrcode'

const SOLANA_ADDRESS = '8czCpJ7Uq9VJEu2emnWohUDnunX4rf5XX866bXEnL7sq'

interface Props {
  onClose: () => void
}

export default function SupportModal({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!canvasRef.current) return
    const isDark = document.documentElement.classList.contains('dark')
    QRCode.toCanvas(canvasRef.current, `solana:${SOLANA_ADDRESS}`, {
      width: 180,
      margin: 0,
      color: {
        dark: isDark ? '#EFE6D0' : '#2A241C',
        light: '#00000000'
      }
    })
  }, [])

  async function handleCopy() {
    await navigator.clipboard.writeText(SOLANA_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[22px] font-medium text-text">
          Support this project
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
          Decision Journal is free, open source, and built independently. If you find it
          valuable, consider sending a donation.
        </p>

        {/* QR code */}
        <div className="mt-5 flex justify-center">
          <div className="rounded-xl border border-border bg-bg p-4">
            <canvas ref={canvasRef} className="block" />
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-text-muted">
          Scan with Phantom or any Solana wallet
        </p>

        {/* Wallet address + copy */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
          <span className="min-w-0 flex-1 select-text truncate font-mono text-[11.5px] text-text">
            {SOLANA_ADDRESS}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-nav-active hover:text-text"
          >
            {copied ? (
              <Check size={14} strokeWidth={2} className="text-green-600 dark:text-green-400" />
            ) : (
              <Copy size={14} strokeWidth={1.75} />
            )}
          </button>
        </div>

        {copied && (
          <p className="mt-1.5 text-center text-[11px] font-medium text-green-600 dark:text-green-400">
            Address copied to clipboard
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
