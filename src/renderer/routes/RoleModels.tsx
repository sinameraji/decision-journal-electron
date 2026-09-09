import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  UserSearch,
  Link2,
  Check,
  ArrowLeft,
  ChevronRight
} from 'lucide-react'
import {
  CLAIM_SECTIONS,
  CLAIM_SECTION_BLURBS,
  CLAIM_SECTION_LABELS,
  MAX_DISAMBIGUATION_ROUNDS,
  SOURCE_TYPE_LABELS,
  type SourceType,
  type ClaimSection,
  type RoleModel,
  type RoleModelFramework,
  type RoleModelSettings
} from '@shared/roleModels'
import { useRoleModelsStore } from '../store/roleModels'
import { Avatar } from './chat/LensSlashPopover'

export default function RoleModels() {
  const settings = useRoleModelsStore((s) => s.settings)
  const models = useRoleModelsStore((s) => s.models)
  const init = useRoleModelsStore((s) => s.init)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  // Settled people become tiles; anything mid-flight or failed stays full width
  // because it is waiting on the user.
  const ready = models.filter((m) => m.status === 'ready')
  const needsAttention = models.filter((m) => m.status !== 'ready')
  const openModel = selected ? (models.find((m) => m.id === selected) ?? null) : null

  if (!settings) {
    return (
      <div className="mx-auto max-w-[780px]">
        <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
          Role Models
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">Loading…</p>
      </div>
    )
  }

  if (openModel) {
    return (
      <div className="mx-auto max-w-[780px] pb-12">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-[12px] text-text-muted hover:text-text"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          All role models
        </button>
        <RoleModelCard model={openModel} startExpanded />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[780px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Role Models
      </h1>
      <p className="mt-1 max-w-[620px] text-[13px] leading-relaxed text-text-muted">
        People whose thinking you want to borrow — from any field or century. The app looks each
        one up, checks it found the right person, then builds a profile from public sources,
        leaning on their own writing and speech before anyone else’s opinion of them. Every claim
        carries the link it came from, and their frameworks appear in chat beside the built-in
        ones.
      </p>

      <StatusCard settings={settings} />

      {settings.enabled && <AddForm />}

      {/* Anything still needing a decision from the user stays full width and
          above the gallery — a pending "is this the right person?" must not be
          reduced to a tile among settled ones. */}
      {needsAttention.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          {needsAttention.map((m) => (
            <RoleModelCard key={m.id} model={m} />
          ))}
        </div>
      )}

      {ready.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {ready.map((m) => (
            <RoleModelTile key={m.id} model={m} onOpen={() => setSelected(m.id)} />
          ))}
        </div>
      )}

      {models.length === 0 && settings.enabled && (
        <div className="mt-6 rounded-xl border border-border bg-bg-elevated px-5 py-8 text-center text-[12.5px] text-text-muted">
          No role models yet. Add anyone whose decisions are publicly documented — a physician, an
          explorer, a coach, a scientist, a statesperson, a teacher, a builder.
        </div>
      )}
    </div>
  )
}

/** Compact gallery tile: who they are, and what you can borrow from them. */
function RoleModelTile({ model, onOpen }: { model: RoleModel; onOpen: () => void }) {
  const shown = model.frameworks.slice(0, 3)
  const more = model.frameworks.length - shown.length
  const name = model.name ?? model.query

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-start rounded-xl border border-border bg-bg-elevated px-4 py-3.5 text-left transition-colors hover:bg-nav-active"
    >
      <div className="flex w-full items-start gap-3">
        <Avatar name={name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium text-text">{name}</div>
          {model.lifespan && (
            <div className="mt-0.5 truncate text-[11px] text-text-muted">{model.lifespan}</div>
          )}
        </div>
        <ChevronRight size={14} strokeWidth={2} className="mt-1 shrink-0 text-text-muted/50" />
      </div>

      {model.distinguisher && (
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-text-muted">
          {model.distinguisher}
        </p>
      )}

      {shown.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {shown.map((f) => (
            <span
              key={f.id}
              className="max-w-full truncate rounded border border-border bg-bg px-1.5 py-0.5 text-[10.5px] text-text-muted"
              title={f.summary}
            >
              {f.name}
            </span>
          ))}
          {more > 0 && (
            <span className="rounded px-1.5 py-0.5 text-[10.5px] text-text-muted/70">
              and {more} more
            </span>
          )}
        </div>
      )}
    </button>
  )
}

function StatusCard({ settings }: { settings: RoleModelSettings }) {
  const setEnabled = useRoleModelsStore((s) => s.setEnabled)
  const [showConsent, setShowConsent] = useState(false)
  const blocked = settings.blockedByOnlineDisabled
  const on = settings.enabled

  const tone = on
    ? 'border-emerald-500/40 bg-emerald-500/5'
    : blocked
      ? 'border-amber-500/40 bg-amber-500/5'
      : 'border-red-500/40 bg-red-500/5'
  const dot = on ? 'bg-emerald-500' : blocked ? 'bg-amber-500' : 'bg-red-500'
  const labelTone = on
    ? 'text-emerald-700 dark:text-emerald-400'
    : blocked
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'

  return (
    <>
      <div className={`mt-5 rounded-xl border px-5 py-4 ${tone}`}>
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <span className={`text-[14px] font-medium ${labelTone}`}>
                {on ? 'Role models are on' : blocked ? 'Role models unavailable' : 'Role models are off'}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
              {on ? (
                <>
                  {settings.count} added. Lookups run on{' '}
                  <span className="font-mono text-[11.5px]">{settings.modelId}</span> — chosen for
                  having many zero-data-retention routes, since a lookup makes several searches in
                  a row. This is separate from the model Chat uses.
                </>
              ) : blocked ? (
                'This needs online AI, which is off. Looking a person up requires a web search through OpenRouter.'
              ) : (
                'Off by default. Turning it on lets the app search the web for people you name — no part of your journal is sent.'
              )}
            </p>
          </div>
          {blocked ? (
            <Link
              to="/settings"
              state={{ section: 'online' }}
              className="shrink-0 rounded-md border border-border bg-bg px-3 py-1.5 text-[12px] text-text hover:bg-nav-active"
            >
              Turn on online AI
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => (on ? void setEnabled(false) : setShowConsent(true))}
              className={[
                'shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium',
                on
                  ? 'border-border bg-bg text-text hover:bg-nav-active'
                  : 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text'
              ].join(' ')}
            >
              {on ? 'Turn off' : 'Turn on'}
            </button>
          )}
        </div>
      </div>

      {showConsent && (
        <ConsentModal
          onCancel={() => setShowConsent(false)}
          onAccept={async () => {
            setShowConsent(false)
            await setEnabled(true)
          }}
        />
      )}
    </>
  )
}

function ConsentModal({ onCancel, onAccept }: { onCancel: () => void; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-sm">
      <div className="w-[480px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">Turn on role models?</h3>
        <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-text-muted">
          <p>
            When you add a name, the app asks your OpenRouter model to search the web for that
            person. The search query is the name you typed — <span className="font-medium text-text">no
            part of your journal is sent</span>, and role-model lookups never carry your decisions.
          </p>
          <p>
            The search itself is run by OpenRouter’s search provider, so the name you type reaches
            them. Profiles are stored encrypted on this Mac.
          </p>
          <p>
            Profiles describe what has been publicly reported, with a link for every claim. They
            are assembled by a model and can be wrong — treat them as a starting point, not a
            biography, and delete anything that looks off.
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
            onClick={onAccept}
            className="rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12.5px] text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
          >
            I understand — turn it on
          </button>
        </div>
      </div>
    </div>
  )
}

function AddForm() {
  const add = useRoleModelsStore((s) => s.add)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!name.trim() || busy) return
    setBusy(true)
    const err = await add(name)
    setBusy(false)
    if (err) setError(err)
    else {
      setName('')
      setError(null)
    }
  }

  return (
    <div className="mt-5">
      <label className="block text-[12.5px] font-medium text-text">
        Who is a role model you want to add?
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="A name — e.g. Ibn Sina"
          className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text placeholder:text-text-muted focus:border-[rgb(var(--accent))] focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3.5 py-2 text-[12.5px] font-medium text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
        >
          <Plus size={13} strokeWidth={2} />
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-red-500">{error}</p>}
      {/* Spread across eras and fields, so the field does not read as one worldview. */}
      <p className="mt-1.5 text-[11px] leading-relaxed text-text-muted">
        Ibn Sina, Marie Curie, Ernest Shackleton, Wangari Maathai. The more they wrote or said in
        their own words, the better this works.
      </p>
    </div>
  )
}

function RoleModelCard({
  model,
  startExpanded
}: {
  model: RoleModel
  /** The detail view opens with the background already showing. */
  startExpanded?: boolean
}) {
  const confirm = useRoleModelsStore((s) => s.confirm)
  const reject = useRoleModelsStore((s) => s.reject)
  const rebuild = useRoleModelsStore((s) => s.rebuild)
  const remove = useRoleModelsStore((s) => s.remove)
  const setFrameworkEnabled = useRoleModelsStore((s) => s.setFrameworkEnabled)
  const retry = useRoleModelsStore((s) => s.retry)

  const [hint, setHint] = useState('')
  const [expanded, setExpanded] = useState(startExpanded ?? false)
  const display = model.name ?? model.query

  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
      <div className="flex items-start gap-3">
        <Avatar name={display} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[15px] font-medium text-text">{display}</span>
            {model.lifespan && (
              <span className="text-[11.5px] text-text-muted">{model.lifespan}</span>
            )}
          </div>
          {model.distinguisher && (
            <p className="mt-0.5 text-[12px] text-text-muted">{model.distinguisher}</p>
          )}

          {(model.status === 'identifying' || model.status === 'building') && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-text-muted">
              <Loader2 size={13} strokeWidth={2} className="animate-spin" />
              {model.status === 'identifying'
                ? `Working out who you meant… (attempt ${model.rounds + 1} of ${MAX_DISAMBIGUATION_ROUNDS})`
                : 'Reading public sources and building the profile…'}
            </div>
          )}

          {model.status === 'error' && (
            <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
              <div className="flex items-start gap-2 text-[12px] text-red-600 dark:text-red-400">
                <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
                <span>{model.lastError ?? 'Something went wrong.'}</span>
              </div>
              {/* A transient upstream failure should not cost the user their typing. */}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void retry(model.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1 text-[11.5px] text-text hover:bg-nav-active"
                >
                  <RefreshCw size={11} strokeWidth={2} />
                  Try again
                </button>
                <Link
                  to="/settings"
                  state={{ section: 'online' }}
                  className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11.5px] text-text hover:bg-nav-active"
                >
                  Change model
                </Link>
              </div>
            </div>
          )}

          {model.status === 'awaiting-confirmation' && (
            <div className="mt-3">
              <p className="text-[12.5px] font-medium text-text">Is this who you meant?</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {model.candidates.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-start gap-3 rounded-lg border border-border bg-bg px-3 py-2"
                  >
                    <Avatar name={c.name} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[12.5px] font-medium text-text">{c.name}</span>
                        {c.lifespan && (
                          <span className="text-[10.5px] text-text-muted">{c.lifespan}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                        {c.distinguisher}
                      </p>
                      {c.sourceUrl && <SourceLink url={c.sourceUrl} title={null} />}
                    </div>
                    <button
                      type="button"
                      onClick={() => void confirm(model.id, c.name)}
                      className="shrink-0 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-2.5 py-1 text-[11.5px] font-medium text-accent-text hover:opacity-90 dark:border-border dark:bg-transparent dark:text-text"
                    >
                      That’s them
                    </button>
                  </div>
                ))}
              </div>

              {model.rounds < MAX_DISAMBIGUATION_ROUNDS ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void reject(model.id, hint)
                    }}
                    placeholder="None of these — add a detail, e.g. “the physicist”"
                    className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text placeholder:text-text-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void reject(model.id, hint)}
                    className="shrink-0 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text hover:bg-nav-active"
                  >
                    Try again
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-400">
                  Out of attempts. Remove this and try a more specific name.
                </p>
              )}
            </div>
          )}

          {model.status === 'ready' && (
            <>
              {model.summary && (
                <p
                  className="mt-2 text-[12.5px] leading-relaxed text-text-muted"
                  style={
                    expanded
                      ? undefined
                      : {
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }
                  }
                >
                  {model.summary}
                </p>
              )}

              {/* The frameworks are what this feature is for — they are what you
                  actually use in chat — so they lead rather than sitting under a
                  biography the user has to scroll past. */}
              {model.frameworks.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      Frameworks
                    </span>
                    <span className="text-[10.5px] text-text-muted/80">
                      type <span className="font-mono">/</span> in chat to use these
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {model.frameworks.map((f) => (
                      <FrameworkRow
                        key={f.id}
                        framework={f}
                        onToggle={setFrameworkEnabled}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AddSourceButton model={model} />
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text-muted hover:text-text"
                >
                  {expanded ? 'Hide background' : `Background — ${model.claims.length} sourced claims`}
                </button>
              </div>

              {expanded && <Profile model={model} />}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {model.status === 'ready' && (
            <button
              type="button"
              title="Rebuild from sources"
              onClick={() => void rebuild(model.id)}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:text-text"
            >
              <RefreshCw size={12} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            title="Remove"
            onClick={() => void remove(model.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-bg text-text-muted hover:text-red-500"
          >
            <Trash2 size={12} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  )
}

/** Background: how they are regarded, and the sourced claims behind it. */
function Profile({ model }: { model: RoleModel }) {
  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3">
      <div className="rounded-lg border border-border bg-bg px-3 py-2 text-[11px] leading-relaxed text-text-muted">
        Claims grounded in this person’s own words or published work are marked{' '}
        <span className="text-emerald-700 dark:text-emerald-400">their own words</span> and listed
        first. People worth studying tend to be polarising, so second-hand characterisation often
        says as much about the writer as the subject — the distinction is kept visible rather than
        averaged away.
      </div>

      {model.sentiment && (
        <Section label="How they are regarded" blurb="">
          <p className="text-[12px] leading-relaxed text-text-muted">{model.sentiment}</p>
        </Section>
      )}

      {CLAIM_SECTIONS.map((section) => {
        const claims = model.claims.filter((c) => c.section === section)
        if (claims.length === 0) return null
        return (
          <Section
            key={section}
            label={CLAIM_SECTION_LABELS[section]}
            blurb={CLAIM_SECTION_BLURBS[section]}
            warn={section === 'caution'}
          >
            <ul className="flex flex-col gap-2">
              {claims.map((c) => (
                <li key={c.id} className="text-[12px] leading-relaxed text-text">
                  {c.text}
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <ProvenanceBadge type={c.sourceType} />
                    <SourceLink url={c.sourceUrl} title={c.sourceTitle} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )
      })}

    </div>
  )
}

function Section({
  label,
  blurb,
  warn,
  children
}: {
  label: string
  blurb: string
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        className={[
          'text-[11px] font-semibold uppercase tracking-wide',
          warn ? 'text-amber-700 dark:text-amber-400' : 'text-text-muted'
        ].join(' ')}
      >
        {label}
      </div>
      {blurb && <p className="mt-0.5 text-[11px] text-text-muted/80">{blurb}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

/** One framework, compact enough to sit above the fold. */
function FrameworkRow({
  framework,
  onToggle
}: {
  framework: RoleModelFramework
  onToggle: (id: string, enabled: boolean) => Promise<void>
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg px-3 py-2">
      <Sparkles size={12} strokeWidth={2} className="mt-1 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-text">{framework.name}</div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">{framework.summary}</p>
        <span className="mt-1 flex flex-wrap items-center gap-2">
          <ProvenanceBadge type={framework.sourceType} />
          {framework.sourceUrl && (
            <SourceLink url={framework.sourceUrl} title={framework.sourceTitle} />
          )}
        </span>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
        <input
          type="checkbox"
          checked={framework.enabled}
          onChange={(e) => void onToggle(framework.id, e.target.checked)}
          className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
        />
        In chat
      </label>
    </div>
  )
}

/**
 * Feeding the profile one document at a time.
 *
 * A lookup finds what search surfaces; someone with decades of essays or
 * speeches has far more than that, and the user knows which pieces matter.
 * Presented as a button rather than a line of text — as prose it read as a
 * caption and nobody would guess it was a control.
 */
function AddSourceButton({ model }: { model: RoleModel }) {
  const addSource = useRoleModelsStore((s) => s.addSource)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!url.trim() || busy) return
    setBusy(true)
    const err = await addSource(model.id, url)
    setBusy(false)
    if (err) setError(err)
    else {
      setUrl('')
      setError(null)
      setOpen(false)
    }
  }

  const reading = model.addedSources.filter((s) => s.status === 'reading')
  const done = model.addedSources.filter((s) => s.status !== 'reading')

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[11.5px] text-text hover:bg-nav-active"
      >
        <Link2 size={12} strokeWidth={2} />
        Add something they wrote or said
      </button>

      {open && (
        <div className="mt-2 w-full">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit()
                if (e.key === 'Escape') setOpen(false)
              }}
              autoFocus
              placeholder="Paste a link to an essay, speech transcript or interview…"
              className="flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5 text-[12px] text-text placeholder:text-text-muted focus:border-[rgb(var(--accent))] focus:outline-none"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!url.trim() || busy}
              className="shrink-0 rounded-md border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-3 py-1.5 text-[12px] font-medium text-accent-text hover:opacity-90 disabled:opacity-40 dark:border-border dark:bg-transparent dark:text-text"
            >
              {busy ? 'Reading…' : 'Read it'}
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-text-muted">
            Only what that document actually supports is added, and it is kept as their own words.
          </p>
          {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
        </div>
      )}

      {reading.length > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
          <Loader2 size={11} strokeWidth={2} className="animate-spin" />
          Reading {reading.length} source{reading.length === 1 ? '' : 's'}…
        </span>
      )}

      {done.length > 0 && (
        <ul className="mt-1 w-full flex-col gap-1">
          {done.slice(0, 5).map((src) => (
            <li key={src.id} className="flex items-start gap-1.5 text-[10.5px]">
              {src.status === 'added' ? (
                <>
                  <Check
                    size={10}
                    strokeWidth={2.5}
                    className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  />
                  <span className="text-text-muted">
                    {src.title ?? hostOf(src.url)} — added {src.claimsAdded} claim
                    {src.claimsAdded === 1 ? '' : 's'}
                    {src.frameworksAdded > 0 &&
                      `, ${src.frameworksAdded} framework${src.frameworksAdded === 1 ? '' : 's'}`}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle
                    size={10}
                    strokeWidth={2.5}
                    className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  />
                  <span className="text-text-muted">
                    {hostOf(src.url)} — {src.error}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Their own words, or someone else's account of them. */
function ProvenanceBadge({ type }: { type: SourceType }) {
  const primary = type === 'primary'
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        primary
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
          : 'border-border bg-bg-elevated text-text-muted'
      ].join(' ')}
    >
      {SOURCE_TYPE_LABELS[type]}
    </span>
  )
}

/** Opens in the browser; the app never loads remote pages or images itself. */
function SourceLink({ url, title }: { url: string; title: string | null }) {
  let host = url
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // keep the raw string
  }
  return (
    <button
      type="button"
      onClick={() => void window.api.roleModels.openSource(url)}
      title={url}
      className="mt-1 inline-flex max-w-full items-center gap-1 text-[10.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
    >
      <ExternalLink size={9} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{title ?? host}</span>
    </button>
  )
}

export { UserSearch }
