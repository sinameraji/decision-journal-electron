import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  DECISION_CATEGORIES,
  type DecisionCategory,
  type Stakes
} from '@shared/ipc-contract'

const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  career: 'Career',
  money: 'Money',
  relationships: 'Relationships',
  health: 'Health',
  creative: 'Creative',
  other: 'Other'
}

const STAKES_OPTIONS: Array<{ value: Stakes; label: string; hint: string }> = [
  { value: 'low', label: 'Low', hint: 'Small, reversible' },
  { value: 'medium', label: 'Medium', hint: 'Meaningful, partly reversible' },
  { value: 'high', label: 'High', hint: 'Consequential, hard to undo' }
]

const REVIEW_PRESETS: Array<{ label: string; monthsFromNow: number | null }> = [
  { label: 'No reminder', monthsFromNow: null },
  { label: 'In 1 month', monthsFromNow: 1 },
  { label: 'In 3 months', monthsFromNow: 3 },
  { label: 'In 6 months', monthsFromNow: 6 }
]

function addMonths(monthsFromNow: number): number {
  const d = new Date()
  d.setMonth(d.getMonth() + monthsFromNow)
  return d.getTime()
}

export default function NewDecision() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<DecisionCategory>('career')
  const [stakes, setStakes] = useState<Stakes>('medium')
  const [confidence, setConfidence] = useState(70)
  const [predictedOutcome, setPredictedOutcome] = useState('')
  const [alternatives, setAlternatives] = useState('')
  const [reviewIdx, setReviewIdx] = useState(2) // default: 3 months
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSave = title.trim().length > 0 && predictedOutcome.trim().length > 0 && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const preset = REVIEW_PRESETS[reviewIdx]
    try {
      await window.api.decisions.create({
        title: title.trim(),
        body: body.trim(),
        category,
        stakes,
        confidence,
        predictedOutcome: predictedOutcome.trim(),
        alternativesConsidered: alternatives.trim(),
        reviewAt: preset.monthsFromNow != null ? addMonths(preset.monthsFromNow) : null
      })
      navigate('/decisions')
    } catch (err) {
      console.error(err)
      setError('Could not save. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[780px] pb-16">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1.5 text-[12.5px] text-text-muted hover:text-text"
      >
        <ArrowLeft size={14} strokeWidth={1.75} />
        Back
      </button>
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        New Decision
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        Capture your reasoning now. Your future self will thank you.
      </p>

      <div className="mt-8 flex flex-col gap-7">
        <Field label="The decision" hint="One sentence, in your own words.">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Take the offer at the smaller startup."
            className="w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[14.5px] text-text outline-none focus:border-text-muted"
          />
        </Field>

        <Field label="Context" hint="What else should the future-you know?">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="The details, constraints, people involved…"
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[14px] leading-relaxed text-text outline-none focus:border-text-muted"
          />
        </Field>

        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {DECISION_CATEGORIES.map((cat) => (
              <ChipButton
                key={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </ChipButton>
            ))}
          </div>
        </Field>

        <Field label="Stakes">
          <div className="grid grid-cols-3 gap-2">
            {STAKES_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStakes(opt.value)}
                className={[
                  'rounded-lg border px-4 py-3 text-left transition-colors',
                  stakes === opt.value
                    ? 'border-text bg-bg-elevated'
                    : 'border-border bg-bg-elevated hover:border-text-muted'
                ].join(' ')}
              >
                <div className="text-[13.5px] font-medium text-text">{opt.label}</div>
                <div className="mt-0.5 text-[11.5px] text-text-muted">{opt.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="Confidence"
          hint="How likely is it that this decision will turn out well?"
        >
          <div className="rounded-lg border border-border bg-bg-elevated px-5 py-5">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-[32px] font-medium leading-none text-text">
                {confidence}%
              </span>
              <span className="text-[12px] text-text-muted">
                {confidenceLabel(confidence)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="mt-4 w-full accent-text"
            />
            <div className="mt-1 flex justify-between text-[11px] text-text-muted">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </Field>

        <Field
          label="What do you expect to happen?"
          hint="Be specific. Vague predictions can't be scored later."
        >
          <textarea
            value={predictedOutcome}
            onChange={(e) => setPredictedOutcome(e.target.value)}
            rows={3}
            placeholder="Within six months, I'll be shipping faster and learning more, even with the pay cut."
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[14px] leading-relaxed text-text outline-none focus:border-text-muted"
          />
        </Field>

        <Field
          label="Alternatives you considered"
          hint="Even one line is enough. This unlocks opportunity-cost analysis later."
        >
          <textarea
            value={alternatives}
            onChange={(e) => setAlternatives(e.target.value)}
            rows={3}
            placeholder="Stay at current job; take the big-tech offer."
            className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-[14px] leading-relaxed text-text outline-none focus:border-text-muted"
          />
        </Field>

        <Field label="Remind me to review this">
          <div className="flex flex-wrap gap-2">
            {REVIEW_PRESETS.map((preset, i) => (
              <ChipButton key={preset.label} active={reviewIdx === i} onClick={() => setReviewIdx(i)}>
                {preset.label}
              </ChipButton>
            ))}
          </div>
        </Field>

        {error && <div className="text-[12.5px] text-red-500">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md px-4 py-2 text-[13px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-5 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 disabled:opacity-50 dark:bg-transparent dark:border-border dark:text-text"
          >
            {saving ? 'Saving…' : 'Save decision'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
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
      <label className="block text-[13px] font-medium text-text">{label}</label>
      {hint && <p className="mt-0.5 text-[12px] text-text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function ChipButton({
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
        'rounded-full border px-4 py-2 text-[12.5px] transition-colors',
        active
          ? 'border-text bg-text text-bg dark:bg-bg-elevated dark:text-text dark:border-text'
          : 'border-border bg-bg-elevated text-text-muted hover:text-text hover:border-text-muted'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function confidenceLabel(c: number): string {
  if (c <= 20) return 'Coin flip against'
  if (c <= 40) return 'Long shot'
  if (c <= 55) return 'Uncertain'
  if (c <= 70) return 'Leaning yes'
  if (c <= 85) return 'Confident'
  return 'Very confident'
}
