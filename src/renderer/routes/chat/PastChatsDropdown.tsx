import { useEffect, useRef, useState } from 'react'
import { Clock, Globe, Trash2 } from 'lucide-react'
import { useChatStore } from '../../store/chat'

function relativeDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function PastChatsDropdown() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const conversationList = useChatStore((s) => s.conversationList)
  const loadConversationList = useChatStore((s) => s.loadConversationList)
  const loadConversation = useChatStore((s) => s.loadConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const activeConversationId = useChatStore((s) => s.activeConversationId)

  useEffect(() => {
    if (open) {
      void loadConversationList()
    }
  }, [open, loadConversationList])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text"
        title="Past chats"
      >
        <Clock size={12} strokeWidth={2} />
        History
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-bg-elevated shadow-lg">
          <div className="px-3 py-2 text-[11px] font-medium text-text-muted">
            Past chats
          </div>
          {conversationList.length === 0 ? (
            <div className="px-3 pb-3 text-[12px] text-text-muted/60">
              No past conversations yet.
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto pb-1.5">
              {conversationList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    void loadConversation(c.id)
                    setOpen(false)
                  }}
                  className={[
                    'group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-nav-active',
                    c.id === activeConversationId ? 'bg-nav-active' : ''
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-text">
                      {c.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-text-muted">
                      {c.provider === 'openrouter' && (
                        <Globe
                          size={9}
                          strokeWidth={2}
                          className="text-amber-600 dark:text-amber-400"
                        />
                      )}
                      {relativeDate(c.updatedAt)}
                    </div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      void deleteConversation(c.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation()
                        void deleteConversation(c.id)
                      }
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted/40 opacity-0 hover:text-red-500 group-hover:opacity-100"
                    title="Delete conversation"
                  >
                    <Trash2 size={11} strokeWidth={2} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
