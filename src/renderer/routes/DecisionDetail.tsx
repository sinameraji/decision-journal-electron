import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, CheckCircle2 } from 'lucide-react'
import {
  MENTAL_STATE_LABELS,
  parseAlternatives,
  type Decision,
  type DecisionOption
} from '@shared/ipc-contract'
import LensPanel from '../components/LensPanel'

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function DecisionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [decision, setDecision] = useState<Decision | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    window.api.decisions.get(id).then((d) => {
      if (cancelled) return
      if (!d) {
        navigate('/decisions', { replace: true })
        return
      }
      setDecision(d)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (loading || !decision) {
    return <div className="h-full w-full bg-bg" />
  }

  const parsed = parseAlternatives(decision.alternatives)
  const reviewed = decision.reviewedAt !== null

  return (
    <div className="mx-auto max-w-[780px] pb-16">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/decisions')}
            aria-label="Back to decisions"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted hover:text-text"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
          </button>
          <p className="text-[12.5px] text-text-muted">
            Decided {formatDate(decision.decidedAt)}
            {decision.reviewAt !== null && (
              <> · Review {formatDate(decision.reviewAt)}</>
            )}
            {reviewed && decision.reviewedAt !== null && (
              <>
                {' '}
                ·{' '}
                <span className="text-text">
                  Reviewed {formatDate(decision.reviewedAt)}
                </span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/decisions/${decision.id}/edit`)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-[12.5px] text-text hover:bg-nav-active"
        >
          <Pencil size={13} strokeWidth={1.75} />
          Edit
        </button>
      </div>

      <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tight text-text">
        {decision.title}
      </h1>

      {decision.mentalState.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {decision.mentalState.map((s) => (
            <span
              key={s}
              className="rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 text-[11.5px] text-text-muted"
            >
              {MENTAL_STATE_LABELS[s]}
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-5">
        <Section title="Situation" body={decision.situation} />
        <Section title="Problem frame" body={decision.problemStatement} />
        <Section title="Variables governing the outcome" body={decision.variables} />
        <Section title="Complications" body={decision.complications} />

        <div>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
            Options considered
          </h2>
          <div className="mt-3">
            <OptionsDisplay parsed={parsed} />
          </div>
        </div>

        <Section title="Range of outcomes" body={decision.rangeOfOutcomes} />
        <Section
          title="Expected outcome (with probabilities)"
          body={decision.expectedOutcome}
        />

        {reviewed && (
          <>
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-5">
              <CheckCircle2 size={14} strokeWidth={1.75} className="text-text-muted" />
              <span className="text-[12px] font-medium uppercase tracking-wide text-text-muted">
                Review · {formatDateTime(decision.reviewedAt ?? 0)}
              </span>
            </div>
            <Section title="What actually happened" body={decision.outcome} />
            <Section title="Lessons learned" body={decision.lessonsLearned} />
          </>
        )}
      </div>

      <div className="mt-8">
        <LensPanel decisionId={decision.id} />
      </div>
    </div>
  )
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body || body.trim() === '') return null
  return (
    <div>
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h2>
      <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-text">
        {body}
      </p>
    </div>
  )
}

function OptionsDisplay({ parsed }: { parsed: ReturnType<typeof parseAlternatives> }) {
  if (parsed.kind === 'empty') {
    return (
      <p className="text-[13px] italic text-text-muted">No alternatives recorded.</p>
    )
  }
  if (parsed.kind === 'legacy') {
    return (
      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text">
        {parsed.text}
      </p>
    )
  }
  const options = parsed.options
  if (options.length === 0) {
    return (
      <p className="text-[13px] italic text-text-muted">No alternatives recorded.</p>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt, i) => (
        <OptionCard key={opt.id} option={opt} index={i} />
      ))}
    </div>
  )
}

function OptionCard({ option, index }: { option: DecisionOption; index: number }) {
  return (
    <div
      className={[
        'rounded-xl border bg-bg-elevated px-4 py-3',
        option.chosen
          ? 'border-[rgb(var(--accent))] dark:border-text'
          : 'border-border'
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13.5px] font-medium text-text">
          {option.name.trim() || `Option ${index + 1}`}
        </span>
        {option.chosen && (
          <span className="rounded-full bg-[rgb(var(--accent))] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-accent-text dark:bg-text/10 dark:text-text">
            Chosen
          </span>
        )}
      </div>
      {option.note.trim() !== '' && (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-text-muted">
          {option.note}
        </p>
      )}
    </div>
  )
}
