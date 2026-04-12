import { useEffect } from 'react'

interface Props {
  onClose: () => void
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['⌘', 'K'], label: 'Quick navigation' }
]

export default function ShortcutsModal({ onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Keyboard shortcuts</h3>
        <p className="mt-1 text-[12.5px] text-text-muted">A few ways to move faster.</p>

        <div className="mt-5 flex flex-col gap-px overflow-hidden rounded-xl border border-border bg-bg">
          {SHORTCUTS.map(({ keys, label }) => (
            <div
              key={label}
              className="flex items-center justify-between px-4 py-3 text-[13px] text-text"
            >
              <span>{label}</span>
              <span className="flex items-center gap-0.5">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-border bg-bg-elevated px-1.5 font-mono text-[11px] text-text-muted"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>

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
