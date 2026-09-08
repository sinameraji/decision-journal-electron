import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Brain,
  Check,
  Loader2,
  Pencil,
  Plus,
  Quote,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react'
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  MEMORY_KIND_LABELS,
  type MemoryCategory,
  type MemoryItem,
  type MemorySettings
} from '@shared/memory'
import { useMemoryStore } from '../store/memory'
import MemoryBackfillModal from '../components/MemoryBackfillModal'
import MemoryConsentModal from '../components/MemoryConsentModal'

type Tab = 'pending' | 'approved' | 'stale'

export default function Memory() {
  const settings = useMemoryStore((s) => s.settings)
  const items = useMemoryStore((s) => s.items)
  const jobs = useMemoryStore((s) => s.jobs)
  const loading = useMemoryStore((s) => s.loading)
  const init = useMemoryStore((s) => s.init)
  const forgetAll = useMemoryStore((s) => s.forgetAll)

  const [tab, setTab] = useState<Tab>('pending')
  const [showForget, setShowForget] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showBackfill, setShowBackfill] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const setEnabled = useMemoryStore((s) => s.setEnabled)

  useEffect(() => {
    void init()
  }, [init])

  const byTab = useMemo(() => items.filter((i) => i.state === tab), [items, tab])
  const counts = useMemo(
    () => ({
      pending: items.filter((i) => i.state === 'pending').length,
      approved: items.filter((i) => i.state === 'approved').length,
      stale: items.filter((i) => i.state === 'stale').length
    }),
    [items]
  )
  const activeJobs = jobs.filter((j) => j.state === 'queued' || j.state === 'running')
  const failedJobs = jobs.filter((j) => j.state === 'error')

  if (!settings) {
    return (
      <div className="mx-auto max-w-[780px]">
        <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
          Memory
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[780px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Memory
      </h1>
      <p className="mt-1 max-w-[620px] text-[13px] leading-relaxed text-text-muted">
        What the coach is allowed to remember about you across conversations. Facts quoted
        verbatim from your own entries are kept automatically — you can edit or delete any of
        them. Only the model’s own guesses are put to you, as questions.
      </p>

      <StatusCard
        settings={settings}
        onEnable={() => setShowConsent(true)}
        onDisable={() => void setEnabled(false)}
      />

      {settings.enabled && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
          >
            <Plus size={12} strokeWidth={2} />
            Write one yourself
          </button>
          <button
            type="button"
            onClick={() => setShowBackfill(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
          >
            <Brain size={12} strokeWidth={2} />
            Extract from past decisions…
          </button>
          <button
            type="button"
            onClick={() => setShowForget(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            <Trash2 size={12} strokeWidth={2} />
            Forget everything
          </button>
        </div>
      )}

      {activeJobs.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[12px] text-text-muted">
          <Loader2 size={13} strokeWidth={2} className="animate-spin" />
          Extracting from {activeJobs.length} decision{activeJobs.length === 1 ? '' : 's'}…
        </div>
      )}

      {failedJobs.length > 0 && (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
          {failedJobs.length} extraction{failedJobs.length === 1 ? '' : 's'} failed —{' '}
          {failedJobs[0].lastError ?? 'unknown error'}
        </div>
      )}

      <div className="mt-6 flex gap-1 border-b border-border">
        <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
          Open questions {counts.pending > 0 && <Badge>{counts.pending}</Badge>}
        </TabButton>
        <TabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
          Approved {counts.approved > 0 && <Badge>{counts.approved}</Badge>}
        </TabButton>
        <TabButton active={tab === 'stale'} onClick={() => setTab('stale')}>
          Needs rechecking {counts.stale > 0 && <Badge>{counts.stale}</Badge>}
        </TabButton>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {loading && items.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-text-muted">Loading…</div>
        ) : byTab.length === 0 ? (
          <EmptyTab tab={tab} enabled={settings.enabled} />
        ) : (
          byTab.map((item) => <MemoryRow key={item.id} item={item} />)
        )}
      </div>

      {showForget && <ForgetAllModal onCancel={() => setShowForget(false)} onConfirm={async () => {
        setShowForget(false)
        await forgetAll()
      }} />}

      {showAdd && <AddMemoryModal onClose={() => setShowAdd(false)} />}
      {showConsent && (
        <MemoryConsentModal
          onCancel={() => setShowConsent(false)}
          onAccept={async () => {
            setShowConsent(false)
            await setEnabled(true)
          }}
        />
      )}
      {showBackfill && <MemoryBackfillModal onClose={() => setShowBackfill(false)} />}
    </div>
  )
}

/**
 * On/off state at a glance, with the switch here rather than only in Settings.
 * Colour carries the state: green when running, red when off, amber when it is
 * blocked by something the user has to fix elsewhere.
 */
function StatusCard({
  settings,
  onEnable,
  onDisable
}: {
  settings: MemorySettings
  onEnable: () => void
  onDisable: () => void
}) {
  const blocked = settings.blockedByOnlineDisabled
  const on = settings.enabled

  const tone = on
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : blocked
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-red-500/40 bg-red-500/5'

  const dot = on ? 'bg-emerald-500' : blocked ? 'bg-amber-500' : 'bg-red-500'

  const label = on ? 'Memory is on' : blocked ? 'Memory is unavailable' : 'Memory is off'

  const labelTone = on
    ? 'text-emerald-700 dark:text-emerald-400'
    : blocked
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <div className={`mt-5 rounded-xl border px-5 py-4 ${tone}`}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <span className={`text-[14px] font-medium ${labelTone}`}>{label}</span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
            {on ? (
              <>
                {settings.approvedCount} approved · {settings.pendingCount} waiting for review.
                Extraction runs after you save a decision, on{' '}
                <span className="font-mono text-[11.5px]">{settings.modelId}</span>.
              </>
            ) : blocked ? (
              <>
                Memory needs online AI, which is off. Extraction sends a decision to a model after
                you save it, so both have to be on.
              </>
            ) : (
              <>
                Separate from online chat, because extraction sends a decision automatically after
                you save it rather than only when you press send.
              </>
            )}
          </p>
        </div>

        {blocked ? (
          <SettingsLink section="online" label="Turn on online AI" />
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <SettingsLink section="memory" label="Settings" subtle />
            <button
              type="button"
              onClick={on ? onDisable : onEnable}
              className={[
                'rounded-md border px-3 py-1.5 text-[12px] font-medium',
                on
                  ? 'border-border bg-bg text-text hover:bg-nav-active'
                  : 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text'
              ].join(' ')}
            >
              {on ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Sends the user to the right part of Settings, not the top of the page. */
function SettingsLink({
  section,
  label,
  subtle
}: {
  section: 'memory' | 'online'
  label: string
  subtle?: boolean
}) {
  return (
    <Link
      to="/settings"
      state={{ section }}
      className={[
        'shrink-0 rounded-md px-3 py-1.5 text-[12px]',
        subtle
          ? 'text-text-muted hover:text-text'
          : 'border border-border bg-bg text-text hover:bg-nav-active'
      ].join(' ')}
    >
      {label}
    </Link>
  )
}

function EmptyTab({ tab, enabled }: { tab: Tab; enabled: boolean }) {
  const copy: Record<Tab, string> = {
    pending: enabled
      ? 'Nothing to settle. Facts quoted from your own writing are kept automatically — you only end up here when the model is unsure about something and wants to ask.'
      : 'Nothing here yet.',
    approved: 'No memories yet. Save a decision and anything quoted from it lands here.',
    stale: 'Nothing needs rechecking. Items land here when the decision behind them changes.'
  }
  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-8 text-center text-[12.5px] text-text-muted">
      {copy[tab]}
    </div>
  )
}

function MemoryRow({ item }: { item: MemoryItem }) {
  const approve = useMemoryStore((s) => s.approve)
  const reject = useMemoryStore((s) => s.reject)
  const remove = useMemoryStore((s) => s.remove)
  const updateStatement = useMemoryStore((s) => s.updateStatement)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.statement)
  const [error, setError] = useState<string | null>(null)
  const [showEvidence, setShowEvidence] = useState(false)
  const [answerText, setAnswerText] = useState('')
  const [answering, setAnswering] = useState(false)
  const answer = useMemoryStore((s) => s.answer)

  // An open question is a different interaction from a stored memory: the model
  // is asking, so the primary action is to reply, not to adjudicate.
  const isQuestion = item.state === 'pending' && !!item.question

  async function submitAnswer() {
    if (!answerText.trim() || answering) return
    setAnswering(true)
    const err = await answer(item.id, answerText)
    setAnswering(false)
    if (err) setError(err)
  }

  async function save() {
    const err = await updateStatement(item.id, draft)
    if (err) setError(err)
    else {
      setError(null)
      setEditing(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">
              {MEMORY_CATEGORY_LABELS[item.category]}
            </span>
            <span
              className={[
                'rounded-md border px-1.5 py-0.5 text-[10px]',
                item.kind === 'tentative'
                  ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
                  : 'border-border bg-bg text-text-muted'
              ].join(' ')}
            >
              {MEMORY_KIND_LABELS[item.kind]}
            </span>
            {item.userAuthored && (
              <span className="rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">
                Yours
              </span>
            )}
            {item.applicableDate && (
              <span className="text-[10px] text-text-muted">as of {item.applicableDate}</span>
            )}
          </div>

          {item.question && item.state === 'pending' && (
            <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-text">
              {item.question}
            </p>
          )}

          {editing ? (
            <div className="mt-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] text-text focus:outline-none"
              />
              {error && <div className="mt-1 text-[11px] text-red-500">{error}</div>}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setDraft(item.statement)
                    setError(null)
                  }}
                  className="rounded-md px-2 py-1 text-[11.5px] text-text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11.5px] text-text hover:bg-nav-active"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p
              className={[
                'mt-1.5 leading-relaxed',
                item.question && item.state === 'pending'
                  ? 'text-[12.5px] text-text-muted'
                  : 'text-[13.5px] text-text'
              ].join(' ')}
            >
              {item.question && item.state === 'pending' ? 'Its reading: ' : ''}
              {item.statement}
            </p>
          )}

          {isQuestion && (
            <div className="mt-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void submitAnswer()
                    }
                  }}
                  rows={2}
                  placeholder="Answer in a sentence — what you write becomes the memory…"
                  className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[13px] leading-relaxed text-text placeholder:text-text-muted focus:border-[rgb(var(--accent))] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={!answerText.trim() || answering}
                  className="shrink-0 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3.5 py-2 text-[12.5px] font-medium text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
                >
                  {answering ? 'Saving…' : 'Save'}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void reject(item.id)}
                  className="text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  Not worth remembering
                </button>
                <button
                  type="button"
                  onClick={() => void approve(item.id)}
                  className="text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  Its reading is close enough — keep it
                </button>
              </div>
            </div>
          )}

          {item.sources.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEvidence(!showEvidence)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-text-muted underline-offset-2 hover:text-text hover:underline"
            >
              <Quote size={10} strokeWidth={2} />
              {showEvidence ? 'Hide' : 'Show'} where this came from ({item.sources.length})
            </button>
          )}

          {showEvidence && (
            <div className="mt-2 flex flex-col gap-1.5">
              {item.sources.map((src, i) => (
                <div key={i} className="rounded-md border border-border bg-bg px-2.5 py-1.5">
                  <div className="text-[10.5px] text-text-muted">
                    {src.decisionTitle ?? 'Deleted decision'} · {src.field}
                  </div>
                  <div className="mt-0.5 text-[11.5px] italic leading-relaxed text-text">
                    “{src.excerpt}”
                  </div>
                </div>
              ))}
            </div>
          )}

          {item.state === 'stale' && (
            <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-400">
              <TriangleAlert size={12} strokeWidth={2} className="mt-0.5 shrink-0" />
              The decision this came from has changed since. Recheck it before keeping it.
            </div>
          )}
        </div>

        {!editing && !isQuestion && (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton title="Edit" onClick={() => setEditing(true)}>
              <Pencil size={12} strokeWidth={2} />
            </IconButton>
            {item.state !== 'approved' && (
              <IconButton title="Keep this" onClick={() => void approve(item.id)}>
                <Check size={13} strokeWidth={2.5} />
              </IconButton>
            )}
            <IconButton title="Delete" danger onClick={() => void remove(item.id)}>
              <Trash2 size={12} strokeWidth={2} />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  )
}

function IconButton({
  children,
  title,
  danger,
  onClick
}: {
  children: React.ReactNode
  title: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted',
        danger ? 'hover:text-red-500' : 'hover:text-text'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px]',
        active
          ? 'border-[rgb(var(--accent))] text-text dark:border-text'
          : 'border-transparent text-text-muted hover:text-text'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-bg px-1.5 text-[10px] text-text-muted">
      {children}
    </span>
  )
}

function ForgetAllModal({
  onCancel,
  onConfirm
}: {
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[420px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Forget everything?</h3>
        <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-text-muted">
          <p>
            This deletes every memory, every open question, the record of what you previously
            rejected, and the extraction history — then turns extraction off. It is a true reset:
            re-enabling it later starts from nothing. Your decisions themselves are untouched.
          </p>
          <p>
            Two things this cannot undo: chat transcripts you have already saved may still quote
            the old material, and anything already sent to a provider is out of our hands.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-[12.5px] font-medium text-red-500 hover:bg-red-500/20"
          >
            Forget everything
          </button>
        </div>
      </div>
    </div>
  )
}

function AddMemoryModal({ onClose }: { onClose: () => void }) {
  const refresh = useMemoryStore((s) => s.refresh)
  const [category, setCategory] = useState<MemoryCategory>('goal')
  const [statement, setStatement] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const res = await window.api.memory.add(category, statement)
    if (!res.ok) {
      setError(res.error)
      return
    }
    await refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[460px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Write a memory</h3>
        <p className="mt-1 text-[12.5px] text-text-muted">
          Yours, in your words. It is approved immediately and marked as written by you.
        </p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          className="mt-4 w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12.5px] text-text focus:outline-none"
        >
          {MEMORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {MEMORY_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={3}
          placeholder="I want to be running my own practice within two years."
          className="mt-2 w-full resize-none rounded-md border border-border bg-bg px-2.5 py-2 text-[13px] text-text placeholder:text-text-muted focus:outline-none"
        />
        {error && <div className="mt-1 text-[11.5px] text-red-500">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12.5px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!statement.trim()}
            className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
