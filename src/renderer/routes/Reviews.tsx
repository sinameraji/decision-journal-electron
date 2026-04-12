import { useEffect, useMemo, useState } from 'react'
import { Calendar, CheckCircle2, Clock } from 'lucide-react'
import type { Decision, DecisionResult } from '@shared/ipc-contract'

function formatDate(ts: number): string {
  const d = new Date(ts)
  const month = d.toLocaleString('en-US', { month: 'short' })
  return `${month} ${d.getDate()}, ${d.getFullYear()}`
}

function daysAgo(ts: number): string {
  const diff = Date.now() - ts
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (months === 1) return '1 month ago'
  if (months < 12) return `${months} months ago`
  const years = Math.floor(days / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

export default function Reviews() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  async function refresh() {
    const all = await window.api.decisions.list()
    setDecisions(all)
  }

  useEffect(() => {
    refresh()
  }, [])

  const unreviewed = useMemo(
    () =>
      decisions
        .filter((d) => d.resolvedAt == null)
        .sort((a, b) => {
          // Due reviews first (reviewAt in the past), then by reviewAt asc, then createdAt desc
          const aDue = a.reviewAt != null && a.reviewAt <= Date.now()
          const bDue = b.reviewAt != null && b.reviewAt <= Date.now()
          if (aDue !== bDue) return aDue ? -1 : 1
          if (a.reviewAt != null && b.reviewAt != null) return a.reviewAt - b.reviewAt
          if (a.reviewAt != null) return -1
          if (b.reviewAt != null) return 1
          return b.createdAt - a.createdAt
        }),
    [decisions]
  )

  const resolved = useMemo(
    () =>
      decisions
        .filter((d) => d.resolvedAt != null)
        .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0)),
    [decisions]
  )

  return (
    <div className="mx-auto max-w-[780px] pb-16">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Reviews
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Come back to past decisions and record how they actually turned out.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
          Awaiting review · {unreviewed.length}
        </h2>
        {unreviewed.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-elevated px-5 py-8 text-center text-[13px] text-text-muted">
            All caught up. New decisions will show up here when they're ready to revisit.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {unreviewed.map((d) => (
              <PendingCard
                key={d.id}
                decision={d}
                expanded={activeId === d.id}
                onToggle={() => setActiveId((cur) => (cur === d.id ? null : d.id))}
                onSaved={async () => {
                  setActiveId(null)
                  await refresh()
                }}
              />
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
            Recently reviewed
          </h2>
          <div className="flex flex-col gap-3">
            {resolved.slice(0, 6).map((d) => (
              <ResolvedCard key={d.id} decision={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function PendingCard({
  decision,
  expanded,
  onToggle,
  onSaved
}: {
  decision: Decision
  expanded: boolean
  onToggle: () => void
  onSaved: () => void
}) {
  const due = decision.reviewAt != null && decision.reviewAt <= Date.now()

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-bg-elevated">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-bg-elevated/80"
      >
        <Clock
          size={18}
          strokeWidth={1.75}
          className={['mt-0.5 shrink-0', due ? 'text-text' : 'text-text-muted'].join(' ')}
        />
        <div className="flex-1">
          <p className="text-[14.5px] leading-relaxed text-text">{decision.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
            <span className="flex items-center gap-1">
              <Calendar size={12} strokeWidth={1.75} />
              Logged {daysAgo(decision.createdAt)}
            </span>
            {decision.confidence != null && (
              <span>Stated confidence: {decision.confidence}%</span>
            )}
            {decision.category && <span className="capitalize">{decision.category}</span>}
            {due && <span className="font-medium text-text">Review due</span>}
          </div>
        </div>
      </button>

      {expanded && (
        <ReviewForm decision={decision} onCancel={onToggle} onSaved={onSaved} />
      )}
    </article>
  )
}

function ReviewForm({
  decision,
  onCancel,
  onSaved
}: {
  decision: Decision
  onCancel: () => void
  onSaved: () => void
}) {
  const [actualOutcome, setActualOutcome] = useState('')
  const [result, setResult] = useState<DecisionResult>('as_expected')
  const [processQuality, setProcessQuality] = useState(3)
  const [outcomeQuality, setOutcomeQuality] = useState(3)
  const [lessons, setLessons] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = actualOutcome.trim().length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await window.api.decisions.review({
        id: decision.id,
        actualOutcome: actualOutcome.trim(),
        result,
        processQuality,
        outcomeQuality,
        lessons: lessons.trim()
      })
      onSaved()
    } catch (err) {
      console.error(err)
      setError('Could not save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-border bg-bg px-5 py-5">
      {(decision.predictedOutcome || decision.alternativesConsidered) && (
        <div className="mb-5 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[12.5px]">
          {decision.predictedOutcome && (
            <div>
              <div className="font-medium text-text-muted">You predicted</div>
              <div className="mt-0.5 leading-relaxed text-text">{decision.predictedOutcome}</div>
            </div>
          )}
          {decision.alternativesConsidered && (
            <div className="mt-3">
              <div className="font-medium text-text-muted">Alternatives you considered</div>
              <div className="mt-0.5 leading-relaxed text-text">
                {decision.alternativesConsidered}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-5">
        <ReviewField label="What actually happened?">
          <textarea
            value={actualOutcome}
            onChange={(e) => setActualOutcome(e.target.value)}
            rows={3}
            placeholder="Write it as plainly as you can."
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-text-muted"
          />
        </ReviewField>

        <ReviewField label="Compared to what you expected?">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: 'better', label: 'Better', hint: "Beat my expectation" },
                { value: 'as_expected', label: 'As expected', hint: 'Roughly the call' },
                { value: 'worse', label: 'Worse', hint: "Didn't land" }
              ] as Array<{ value: DecisionResult; label: string; hint: string }>
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResult(opt.value)}
                className={[
                  'rounded-lg border px-3 py-2.5 text-left transition-colors',
                  result === opt.value
                    ? 'border-text bg-bg-elevated'
                    : 'border-border bg-bg-elevated hover:border-text-muted'
                ].join(' ')}
              >
                <div className="text-[13px] font-medium text-text">{opt.label}</div>
                <div className="mt-0.5 text-[11px] text-text-muted">{opt.hint}</div>
              </button>
            ))}
          </div>
        </ReviewField>

        <ReviewField
          label="Process quality"
          hint="Given only what you knew then, how good was your reasoning?"
        >
          <StarRating value={processQuality} onChange={setProcessQuality} />
        </ReviewField>

        <ReviewField label="Outcome quality" hint="Separately — how well did it turn out?">
          <StarRating value={outcomeQuality} onChange={setOutcomeQuality} />
        </ReviewField>

        <ReviewField label="Lessons for next time">
          <textarea
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            rows={2}
            placeholder="One line you'd want to remember."
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-text-muted"
          />
        </ReviewField>

        {error && <div className="text-[12.5px] text-red-500">{error}</div>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-[13px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-5 py-2.5 text-[13px] font-medium text-accent-text hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
          >
            {saving ? 'Saving…' : 'Save review'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewField({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-text">{label}</label>
      {hint && <p className="mt-0.5 text-[11.5px] text-text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={[
            'h-9 w-9 rounded-lg border text-[13px] transition-colors',
            n <= value
              ? 'border-text bg-text text-bg dark:bg-bg-elevated dark:text-text'
              : 'border-border bg-bg-elevated text-text-muted hover:border-text-muted'
          ].join(' ')}
          aria-label={`${n} out of 5`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function ResolvedCard({ decision }: { decision: Decision }) {
  return (
    <article className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="flex-1">
          <p className="text-[14px] leading-relaxed text-text">{decision.title}</p>
          {decision.lessons && (
            <p className="mt-1.5 text-[12.5px] italic text-text-muted">
              &ldquo;{decision.lessons}&rdquo;
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
            {decision.resolvedAt && <span>Reviewed {daysAgo(decision.resolvedAt)}</span>}
            {decision.result && <span className="capitalize">{decision.result.replace('_', ' ')}</span>}
            {decision.processQuality != null && decision.outcomeQuality != null && (
              <span>
                process {decision.processQuality}/5 · outcome {decision.outcomeQuality}/5
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-[11.5px] text-text-muted">
          {formatDate(decision.createdAt)}
        </div>
      </div>
    </article>
  )
}
