import { useEffect, useState } from 'react'

const GITHUB_URL = 'https://github.com/sinameraji/decision-journal-electron'

interface Props {
  onClose: () => void
}

export default function AboutModal({ onClose }: Props) {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.app.version().then(setVersion)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function openGithub() {
    await window.api.app.openExternal(GITHUB_URL)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[380px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[22px] font-medium text-text">Decision Journal</h3>
        <p className="mt-1 text-[12.5px] text-text-muted">v{version || '…'}</p>

        <div className="mt-5 space-y-3 text-[13px] text-text-muted">
          <p>A local-first, fully offline, end-to-end encrypted decision journal for macOS.</p>
          <p>Your decisions never leave your device.</p>
          <p className="text-text">Created by Sina Meraji</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openGithub}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-[12.5px] text-text hover:bg-nav-active"
          >
            View on GitHub
          </button>
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
