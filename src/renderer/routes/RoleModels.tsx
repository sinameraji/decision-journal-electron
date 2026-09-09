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
  UserSearch
} from 'lucide-react'
import {
  CLAIM_SECTIONS,
  CLAIM_SECTION_BLURBS,
  CLAIM_SECTION_LABELS,
  MAX_DISAMBIGUATION_ROUNDS,
  type ClaimSection,
  type RoleModel,
  type RoleModelSettings
} from '@shared/roleModels'
import { useRoleModelsStore } from '../store/roleModels'
import { Avatar } from './chat/LensSlashPopover'

export default function RoleModels() {
  const settings = useRoleModelsStore((s) => s.settings)
  const models = useRoleModelsStore((s) => s.models)
  const init = useRoleModelsStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

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

  return (
    <div className="mx-auto max-w-[780px] pb-12">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Role Models
      </h1>
      <p className="mt-1 max-w-[620px] text-[13px] leading-relaxed text-text-muted">
        People whose thinking you want to borrow. The app looks each one up, checks it found the
        right person, then builds a profile from public sources — every claim carrying the link it
        came from. Their frameworks then appear in chat beside the built-in ones.
      </p>

      <StatusCard settings={settings} />

      {settings.enabled && <AddForm />}

      <div className="mt-6 flex flex-col gap-3">
        {models.length === 0 ? (
          settings.enabled && (
            <div className="rounded-xl border border-border bg-bg-elevated px-5 py-8 text-center text-[12.5px] text-text-muted">
              No role models yet. Add someone above — a founder, an investor, a scientist, anyone
              whose decisions are publicly documented.
            </div>
          )
        ) : (
          models.map((m) => <RoleModelCard key={m.id} model={m} />)
        )}
      </div>
    </div>
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
                  <span className="font-mono text-[11.5px]">{settings.modelId}</span> and search the
                  web.
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
          placeholder="A name — e.g. Paul Graham"
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
    </div>
  )
}

function RoleModelCard({ model }: { model: RoleModel }) {
  const confirm = useRoleModelsStore((s) => s.confirm)
  const reject = useRoleModelsStore((s) => s.reject)
  const rebuild = useRoleModelsStore((s) => s.rebuild)
  const remove = useRoleModelsStore((s) => s.remove)
  const setFrameworkEnabled = useRoleModelsStore((s) => s.setFrameworkEnabled)

  const [hint, setHint] = useState('')
  const [expanded, setExpanded] = useState(false)
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
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-600 dark:text-red-400">
              <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>{model.lastError ?? 'Something went wrong.'}</span>
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
                <p className="mt-2 text-[12.5px] leading-relaxed text-text">{model.summary}</p>
              )}
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="mt-2 text-[11.5px] text-text-muted underline-offset-2 hover:text-text hover:underline"
              >
                {expanded ? 'Hide' : 'Show'} profile — {model.claims.length} sourced claims,{' '}
                {model.frameworks.length} frameworks
              </button>
              {expanded && (
                <Profile model={model} onToggleFramework={setFrameworkEnabled} />
              )}
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

function Profile({
  model,
  onToggleFramework
}: {
  model: RoleModel
  onToggleFramework: (id: string, enabled: boolean) => Promise<void>
}) {
  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3">
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
                  <SourceLink url={c.sourceUrl} title={c.sourceTitle} />
                </li>
              ))}
            </ul>
          </Section>
        )
      })}

      {model.frameworks.length > 0 && (
        <Section
          label="Frameworks"
          blurb="These appear in chat when you type / — marked as borrowed, with their initials."
        >
          <div className="flex flex-col gap-2">
            {model.frameworks.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-bg px-3 py-2"
              >
                <Sparkles size={12} strokeWidth={2} className="mt-1 shrink-0 text-text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-text">{f.name}</div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
                    {f.summary}
                  </p>
                  {f.sourceUrl && <SourceLink url={f.sourceUrl} title={f.sourceTitle} />}
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-text-muted">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => void onToggleFramework(f.id, e.target.checked)}
                    className="h-3.5 w-3.5 accent-[rgb(var(--accent))]"
                  />
                  In chat
                </label>
              </div>
            ))}
          </div>
        </Section>
      )}
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
