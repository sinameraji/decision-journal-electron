import { useEffect, useRef } from 'react'
import { Check, ChevronDown, Globe, Laptop, Loader2, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useChatStore } from '../../store/chat'

const QUICK_ONLINE = 6

/**
 * Header dropdown for changing model without a trip back through the picker.
 * Shows the handful you are likely to want, then a link to the full list.
 */
export default function ModelSwitcher({ label }: { label: string }) {
  const open = useChatStore((s) => s.switcherOpen)
  const setOpen = useChatStore((s) => s.setSwitcherOpen)
  const ref = useRef<HTMLDivElement>(null)

  const provider = useChatStore((s) => s.provider)
  const activeModel = useChatStore((s) => s.activeModel)
  const installed = useChatStore((s) => s.installed)
  const catalog = useChatStore((s) => s.catalog)
  const onlineCatalog = useChatStore((s) => s.onlineCatalog)
  const online = useChatStore((s) => s.online)
  const selectModel = useChatStore((s) => s.selectModel)
  const openModelSetup = useChatStore((s) => s.openModelSetup)
  const refreshOnline = useChatStore((s) => s.refreshOnline)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onlineReady = online?.enabled === true && online.hasKey

  useEffect(() => {
    // Opening the menu is the moment the catalog matters; ask for it then, so a
    // lazy fetch has a reason to run and its result lands in view.
    if (open && onlineReady && onlineCatalog.length === 0) void refreshOnline()
  }, [open, onlineReady, onlineCatalog.length, refreshOnline])
  // Default first, then the rest — the list is long and mostly irrelevant here.
  const quickOnline = onlineReady
    ? [...onlineCatalog]
        .sort((a, b) => {
          if (a.id === online?.defaultModel) return -1
          if (b.id === online?.defaultModel) return 1
          return a.name.localeCompare(b.name)
        })
        .slice(0, QUICK_ONLINE)
    : []

  function pick(p: 'ollama' | 'openrouter', id: string) {
    setOpen(false)
    if (p === provider && id === activeModel) return
    selectModel(p, id)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
      >
        <span className="font-serif text-[18px] font-medium text-text">{label}</span>
        <ChevronDown size={14} strokeWidth={2} className="opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[300px] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
          {installed.length > 0 && (
            <>
              <GroupLabel icon={<Laptop size={10} strokeWidth={2} />}>On this Mac</GroupLabel>
              {installed.map((m) => (
                <Row
                  key={m.id}
                  active={provider === 'ollama' && activeModel === m.id}
                  title={catalog.find((c) => c.id === m.id)?.label ?? m.id}
                  sub={m.parameterSize ?? undefined}
                  onClick={() => pick('ollama', m.id)}
                />
              ))}
            </>
          )}

          {/* The online group is always shown. Omitting it when unavailable
              made a configured-but-empty catalog indistinguishable from online
              AI not existing at all. */}
          <GroupLabel icon={<Globe size={10} strokeWidth={2} />}>Online</GroupLabel>

          {!onlineReady && (
            <Link
              to="/settings"
              state={{ section: 'online' }}
              onClick={() => setOpen(false)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-nav-active"
            >
              <span className="flex h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-text">
                  {online?.enabled ? 'Add your OpenRouter key' : 'Online models are off'}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-text-muted">
                  {online?.enabled
                    ? 'Online AI is on but no key is saved — set one up in Settings.'
                    : 'Turn on online AI in Settings to chat with a frontier model.'}
                </span>
              </span>
            </Link>
          )}

          {onlineReady && quickOnline.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-text-muted">
              <Loader2 size={12} strokeWidth={2} className="animate-spin" />
              Loading models…
            </div>
          )}

          {quickOnline.length > 0 && (
            <>
              {quickOnline.map((m) => (
                <Row
                  key={m.id}
                  active={provider === 'openrouter' && activeModel === m.id}
                  title={m.name}
                  sub={[
                    m.promptUsdPerMillion !== null
                      ? `$${m.promptUsdPerMillion.toFixed(2)}/M in · $${(m.completionUsdPerMillion ?? 0).toFixed(2)}/M out`
                      : null,
                    // Route count predicts rate limits far better than price does.
                    m.zdrProviderCount > 0
                      ? `${m.zdrProviderCount} private route${m.zdrProviderCount === 1 ? '' : 's'}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  thin={m.zdrProviderCount > 0 && m.zdrProviderCount < 4}
                  onClick={() => pick('openrouter', m.id)}
                />
              ))}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              openModelSetup()
            }}
            className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[12px] text-text-muted hover:bg-nav-active hover:text-text"
          >
            <Settings2 size={12} strokeWidth={2} />
            All models &amp; setup…
          </button>
        </div>
      )}
    </div>
  )
}

function GroupLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-border/60 bg-bg/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
      {icon}
      {children}
    </div>
  )
}

function Row({
  active,
  title,
  sub,
  thin,
  onClick
}: {
  active: boolean
  title: string
  sub?: string
  thin?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-nav-active"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-text">
        {active && <Check size={12} strokeWidth={2.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-text">{title}</span>
        {sub && (
          <span
            className={[
              'mt-0.5 block truncate text-[10.5px]',
              thin ? 'text-amber-700 dark:text-amber-400' : 'text-text-muted'
            ].join(' ')}
            title={thin ? 'Few private routes — more likely to be rate-limited' : undefined}
          >
            {sub}
          </span>
        )}
      </span>
    </button>
  )
}
