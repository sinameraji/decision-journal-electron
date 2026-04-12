import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  Monitor,
  Moon,
  PlusCircle,
  Search,
  Settings as SettingsIcon,
  Sun,
  type LucideIcon
} from 'lucide-react'
import { useCommandPaletteStore } from '../store/commandPalette'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'

interface Command {
  id: string
  title: string
  keywords?: string
  Icon: LucideIcon
  perform: () => void
}

export default function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open)
  const closePalette = useCommandPaletteStore((s) => s.closePalette)
  const toggle = useCommandPaletteStore((s) => s.toggle)

  const navigate = useNavigate()
  const lock = useAuthStore((s) => s.lock)
  const setMode = useThemeStore((s) => s.setMode)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path)
      closePalette()
    }
    return [
      { id: 'nav.decisions', title: 'Go to Decisions', keywords: 'list home journal', Icon: FileText, perform: go('/decisions') },
      { id: 'nav.new', title: 'New Decision', keywords: 'create add capture record', Icon: PlusCircle, perform: go('/new') },
      { id: 'nav.reviews', title: 'Go to Reviews', keywords: 'outcome past', Icon: Clock, perform: go('/reviews') },
      { id: 'nav.analytics', title: 'Go to Analytics', keywords: 'stats metrics charts', Icon: BarChart3, perform: go('/analytics') },
      { id: 'nav.chat', title: 'Go to Chat', keywords: 'ai coach ollama assistant', Icon: MessageSquare, perform: go('/chat') },
      { id: 'nav.settings', title: 'Go to Settings', keywords: 'preferences pin touch id', Icon: SettingsIcon, perform: go('/settings') },
      {
        id: 'vault.lock',
        title: 'Lock Vault',
        keywords: 'logout sign out secure',
        Icon: Lock,
        perform: () => {
          void lock()
          closePalette()
        }
      },
      {
        id: 'theme.light',
        title: 'Theme: Light',
        keywords: 'appearance bright',
        Icon: Sun,
        perform: () => {
          void setMode('light')
          closePalette()
        }
      },
      {
        id: 'theme.dark',
        title: 'Theme: Dark',
        keywords: 'appearance night',
        Icon: Moon,
        perform: () => {
          void setMode('dark')
          closePalette()
        }
      },
      {
        id: 'theme.system',
        title: 'Theme: System',
        keywords: 'appearance auto default',
        Icon: Monitor,
        perform: () => {
          void setMode('system')
          closePalette()
        }
      }
    ]
  }, [navigate, lock, setMode, closePalette])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? commands.filter((c) => (c.title + ' ' + (c.keywords ?? '')).toLowerCase().includes(q))
    : commands

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isToggle) {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === 'Escape' && useCommandPaletteStore.getState().open) {
        e.preventDefault()
        closePalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, closePalette])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!open) return null

  const clampedIndex = filtered.length === 0 ? 0 : Math.min(selectedIndex, filtered.length - 1)

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[clampedIndex]?.perform()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[18vh] backdrop-blur-sm"
      onClick={closePalette}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-bg-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={16} strokeWidth={1.75} className="text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-[14px] text-text placeholder:text-text-muted focus:outline-none"
            aria-label="Command palette search"
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-text-muted">No commands found</div>
          ) : (
            filtered.map((cmd, i) => {
              const isSelected = i === clampedIndex
              return (
                <button
                  key={cmd.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={cmd.perform}
                  className={[
                    'flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition-colors',
                    isSelected ? 'bg-nav-active text-text' : 'text-text/85'
                  ].join(' ')}
                >
                  <cmd.Icon size={16} strokeWidth={1.75} className="shrink-0 text-text-muted" />
                  <span>{cmd.title}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-2 text-[11px] text-text-muted">
          <span>
            <kbd className="rounded border border-border/80 bg-bg/60 px-1 font-mono text-[10px]">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-border/80 bg-bg/60 px-1 font-mono text-[10px]">↵</kbd> select
          </span>
          <span>
            <kbd className="rounded border border-border/80 bg-bg/60 px-1 font-mono text-[10px]">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
