import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Lock,
  KeyRound,
  Download,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Info,
  Power
} from 'lucide-react'
import type { ThemeMode } from '@shared/ipc-contract'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import ChangePinModal from './ChangePinModal'
import AboutModal from './AboutModal'
import ShortcutsModal from './ShortcutsModal'

type ModalKind = 'change-pin' | 'about' | 'shortcuts' | null
type Toast = { kind: 'success' | 'error'; text: string } | null

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor }
]

interface Props {
  onRequestClose: () => void
}

export default function AvatarMenu({ onRequestClose }: Props) {
  const navigate = useNavigate()
  const lock = useAuthStore((s) => s.lock)
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  const menuRef = useRef<HTMLDivElement>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && modal === null) onRequestClose()
    }
    function onPointer(e: MouseEvent) {
      if (!menuRef.current) return
      if (menuRef.current.contains(e.target as Node)) return
      if (modal !== null) return
      onRequestClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onPointer)
    }
  }, [onRequestClose, modal])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(id)
  }, [toast])

  async function handleLock() {
    onRequestClose()
    await lock()
  }

  function handleChangePin() {
    setModal('change-pin')
  }

  async function handleBackup() {
    if (exporting) return
    setExporting(true)
    const res = await window.api.vault.export()
    setExporting(false)
    if (res.ok) {
      setToast({ kind: 'success', text: `Backup saved to ${res.path}` })
    } else if (res.error !== 'canceled') {
      setToast({ kind: 'error', text: `Backup failed: ${res.error}` })
    }
  }

  function handleSettings() {
    onRequestClose()
    navigate('/settings')
  }

  function handleShortcuts() {
    setModal('shortcuts')
  }

  function handleAbout() {
    setModal('about')
  }

  async function handleQuit() {
    await window.api.app.quit()
  }

  function closeModal() {
    setModal(null)
  }

  return (
    <>
      <div
        ref={menuRef}
        role="menu"
        className="absolute right-0 top-[calc(100%+6px)] z-40 w-[260px] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-xl"
      >
        <Group>
          <Item icon={<Lock size={15} strokeWidth={1.75} />} label="Lock now" onClick={handleLock} />
          <Item
            icon={<KeyRound size={15} strokeWidth={1.75} />}
            label="Change PIN…"
            onClick={handleChangePin}
          />
        </Group>

        <Divider />

        <Group>
          <Item
            icon={<Download size={15} strokeWidth={1.75} />}
            label={exporting ? 'Preparing backup…' : 'Backup vault…'}
            onClick={handleBackup}
            disabled={exporting}
          />
          <Item
            icon={<SettingsIcon size={15} strokeWidth={1.75} />}
            label="Settings"
            onClick={handleSettings}
          />
        </Group>

        <Divider />

        <div className="px-3 py-2.5">
          <div className="mb-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Theme
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-bg p-1">
            {THEME_OPTIONS.map(({ mode, label, Icon }) => {
              const active = mode === themeMode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setThemeMode(mode)}
                  aria-pressed={active}
                  className={[
                    'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[11.5px] transition-colors',
                    active
                      ? 'bg-bg-elevated text-text ring-1 ring-border'
                      : 'text-text-muted hover:text-text'
                  ].join(' ')}
                >
                  <Icon size={12} strokeWidth={1.75} />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <Divider />

        <Group>
          <Item
            icon={<Keyboard size={15} strokeWidth={1.75} />}
            label="Keyboard shortcuts"
            onClick={handleShortcuts}
          />
          <Item
            icon={<Info size={15} strokeWidth={1.75} />}
            label="About Decision Journal"
            onClick={handleAbout}
          />
        </Group>

        <Divider />

        <Group>
          <Item
            icon={<Power size={15} strokeWidth={1.75} />}
            label="Quit"
            onClick={handleQuit}
          />
        </Group>
      </div>

      {toast && (
        <div
          className={[
            'fixed bottom-6 right-6 z-50 max-w-[420px] rounded-lg border px-4 py-3 text-[12.5px] shadow-lg',
            toast.kind === 'success'
              ? 'border-border bg-bg-elevated text-text'
              : 'border-red-500/40 bg-bg-elevated text-red-500'
          ].join(' ')}
        >
          {toast.text}
        </div>
      )}

      {modal === 'change-pin' && <ChangePinModal onClose={closeModal} />}
      {modal === 'about' && <AboutModal onClose={closeModal} />}
      {modal === 'shortcuts' && <ShortcutsModal onClose={closeModal} />}
    </>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col py-1">{children}</div>
}

function Divider() {
  return <div className="h-px bg-border" />
}

function Item({
  icon,
  label,
  onClick,
  disabled
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 px-3 py-2 text-left text-[13px] text-text hover:bg-nav-active disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-5 w-5 items-center justify-center text-text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
    </button>
  )
}
