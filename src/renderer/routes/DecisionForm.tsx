import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import {
  MENTAL_STATES,
  MENTAL_STATE_LABELS,
  type Decision,
  type DecisionCreateInput,
  type MentalState
} from '@shared/ipc-contract'
import { DatePicker, DateTimePicker } from '../components/DateTimePicker'

type Mode = 'create' | 'edit'

interface FormState {
  title: string
  decidedAtLocal: string // YYYY-MM-DDTHH:mm
  reviewAtLocal: string // YYYY-MM-DD
  reviewAtTouched: boolean
  mentalState: MentalState[]
  situation: string
  problemStatement: string
  variables: string
  complications: string
  alternatives: string
  rangeOfOutcomes: string
  expectedOutcome: string
}

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182

const STEPS = [
  { index: 1, label: 'The decision' },
  { index: 2, label: 'The situation' },
  { index: 3, label: 'The analysis' },
  { index: 4, label: 'The options' }
] as const

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function toLocalDateTimeString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function toLocalDateString(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function fromLocalDateTime(s: string): number {
  const ms = new Date(s).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

function fromLocalDate(s: string): number {
  const ms = new Date(`${s}T12:00`).getTime()
  return Number.isFinite(ms) ? ms : Date.now()
}

function emptyForm(): FormState {
  const now = Date.now()
  return {
    title: '',
    decidedAtLocal: toLocalDateTimeString(now),
    reviewAtLocal: toLocalDateString(now + SIX_MONTHS_MS),
    reviewAtTouched: false,
    mentalState: [],
    situation: '',
    problemStatement: '',
    variables: '',
    complications: '',
    alternatives: '',
    rangeOfOutcomes: '',
    expectedOutcome: ''
  }
}

function decisionToForm(d: Decision): FormState {
  return {
    title: d.title,
    decidedAtLocal: toLocalDateTimeString(d.decidedAt),
    reviewAtLocal: toLocalDateString(d.reviewAt ?? d.decidedAt + SIX_MONTHS_MS),
    reviewAtTouched: true,
    mentalState: d.mentalState,
    situation: d.situation,
    problemStatement: d.problemStatement,
    variables: d.variables,
    complications: d.complications,
    alternatives: d.alternatives,
    rangeOfOutcomes: d.rangeOfOutcomes,
    expectedOutcome: d.expectedOutcome
  }
}

function formToInput(f: FormState): DecisionCreateInput {
  return {
    title: f.title.trim(),
    decidedAt: fromLocalDateTime(f.decidedAtLocal),
    reviewAt: f.reviewAtLocal ? fromLocalDate(f.reviewAtLocal) : null,
    mentalState: f.mentalState,
    situation: f.situation,
    problemStatement: f.problemStatement,
    variables: f.variables,
    complications: f.complications,
    alternatives: f.alternatives,
    rangeOfOutcomes: f.rangeOfOutcomes,
    expectedOutcome: f.expectedOutcome
  }
}

export default function DecisionForm({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(() => emptyForm())
  const initialFormRef = useRef<FormState>(form)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    window.api.decisions.get(id).then((d) => {
      if (cancelled || !d) {
        if (!cancelled) navigate('/decisions', { replace: true })
        return
      }
      const f = decisionToForm(d)
      setForm(f)
      initialFormRef.current = f
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [mode, id, navigate])

  const patch = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const onDecidedAtChange = (value: string) => {
    setForm((prev) => {
      const next: FormState = { ...prev, decidedAtLocal: value }
      if (!prev.reviewAtTouched) {
        const ms = fromLocalDateTime(value)
        next.reviewAtLocal = toLocalDateString(ms + SIX_MONTHS_MS)
      }
      return next
    })
  }

  const onReviewAtChange = (value: string) => {
    setForm((prev) => ({ ...prev, reviewAtLocal: value, reviewAtTouched: true }))
  }

  const toggleMentalState = (s: MentalState) => {
    setForm((prev) => ({
      ...prev,
      mentalState: prev.mentalState.includes(s)
        ? prev.mentalState.filter((x) => x !== s)
        : [...prev.mentalState, s]
    }))
  }

  const isDirty = useMemo(() => {
    const a = initialFormRef.current
    return (
      a.title !== form.title ||
      a.decidedAtLocal !== form.decidedAtLocal ||
      a.reviewAtLocal !== form.reviewAtLocal ||
      a.situation !== form.situation ||
      a.problemStatement !== form.problemStatement ||
      a.variables !== form.variables ||
      a.complications !== form.complications ||
      a.alternatives !== form.alternatives ||
      a.rangeOfOutcomes !== form.rangeOfOutcomes ||
      a.expectedOutcome !== form.expectedOutcome ||
      JSON.stringify(a.mentalState) !== JSON.stringify(form.mentalState)
    )
  }, [form])

  const titleValid = form.title.trim().length > 0
  const canGoNext = step === 1 ? titleValid : true

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => s - 1)
    } else {
      exit()
    }
  }

  const exit = () => {
    if (isDirty) setDiscardOpen(true)
    else navigate('/decisions')
  }

  const handleNext = async () => {
    if (!canGoNext || saving) return
    if (step < STEPS.length) {
      setStep((s) => s + 1)
      return
    }
    setSaving(true)
    try {
      const input = formToInput(form)
      if (mode === 'create') {
        await window.api.decisions.create(input)
      } else if (id) {
        await window.api.decisions.update(id, input)
      }
      navigate('/decisions')
    } catch (err) {
      console.error('save decision failed', err)
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="h-full w-full bg-bg" />
  }

  const isLast = step === STEPS.length
  const current = STEPS[step - 1]

  return (
    <div className="mx-auto max-w-[720px] pb-16">
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={exit}
          aria-label="Back to decisions"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-elevated text-text-muted hover:text-text"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="font-serif text-[30px] font-medium leading-tight tracking-tight text-text">
            {mode === 'create' ? 'New Decision' : 'Edit Decision'}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Based on Farnam Street's decision journal
          </p>
        </div>
      </div>

      <StepBar step={step} totalSteps={STEPS.length} label={current.label} />

      <div key={step} className="mt-6">
        {step === 1 && (
          <Card>
            <Field label="What are you deciding?" required>
              <TextField
                value={form.title}
                onChange={(v) => patch('title', v)}
                placeholder="One line that captures the decision"
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 items-start gap-4">
              <Field label="Decided at">
                <DateTimePicker
                  value={form.decidedAtLocal}
                  onChange={onDecidedAtChange}
                />
              </Field>
              <Field
                label="Review date"
                hint="Defaults to 6 months from now. Come back then to log how it played out."
              >
                <DatePicker value={form.reviewAtLocal} onChange={onReviewAtChange} />
              </Field>
            </div>

            <Field
              label="Mental & physical state"
              hint="Pick whatever fits your state right now. There are no wrong answers."
            >
              <ChipSelect
                options={MENTAL_STATES}
                labels={MENTAL_STATE_LABELS}
                selected={form.mentalState}
                onToggle={toggleMentalState}
              />
            </Field>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <Field
              label="The situation / context"
              hint="Where are you? What's going on? Paint the scene."
            >
              <TextAreaField
                value={form.situation}
                onChange={(v) => patch('situation', v)}
                rows={5}
                autoFocus
              />
            </Field>

            <Field
              label="The problem statement or frame"
              hint="How are you framing the problem? A different frame often produces a different answer."
            >
              <TextAreaField
                value={form.problemStatement}
                onChange={(v) => patch('problemStatement', v)}
                rows={5}
              />
            </Field>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <Field
              label="Variables that govern the situation"
              hint="What forces, people, and constraints are actually driving the outcome?"
            >
              <TextAreaField
                value={form.variables}
                onChange={(v) => patch('variables', v)}
                rows={5}
                autoFocus
              />
            </Field>

            <Field
              label="Complications & complexities as I see them"
              hint="What makes this hard? What could go wrong? What do you not fully understand?"
            >
              <TextAreaField
                value={form.complications}
                onChange={(v) => patch('complications', v)}
                rows={5}
              />
            </Field>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <Field
              label="Alternatives you seriously considered and did not choose"
              hint="Name at least two. Why were they rejected?"
            >
              <TextAreaField
                value={form.alternatives}
                onChange={(v) => patch('alternatives', v)}
                rows={5}
                autoFocus
              />
            </Field>

            <Field
              label="Range of outcomes"
              hint="What could actually happen? Best case, worst case, and the murky middle."
            >
              <TextAreaField
                value={form.rangeOfOutcomes}
                onChange={(v) => patch('rangeOfOutcomes', v)}
                rows={5}
              />
            </Field>

            <Field
              label="What I expect to happen — with probabilities"
              hint="Force yourself to put numbers on it. It'll feel silly. Do it anyway."
            >
              <TextAreaField
                value={form.expectedOutcome}
                onChange={(v) => patch('expectedOutcome', v)}
                rows={5}
              />
            </Field>
          </Card>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="rounded-lg border border-border bg-bg-elevated px-4 py-2.5 text-[13px] text-text hover:bg-nav-active"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext || saving}
          className="flex items-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-5 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 disabled:opacity-40 dark:bg-transparent dark:border-border dark:text-text"
        >
          {isLast ? (
            <>
              <Check size={15} strokeWidth={2} />
              {mode === 'create' ? 'Save decision' : 'Save changes'}
            </>
          ) : (
            'Next'
          )}
        </button>
      </div>

      {discardOpen && (
        <ConfirmModal
          title="Discard changes?"
          description="You have unsaved edits. Leaving will lose them."
          confirmLabel="Discard"
          onCancel={() => setDiscardOpen(false)}
          onConfirm={() => navigate('/decisions')}
        />
      )}
    </div>
  )
}

function StepBar({
  step,
  totalSteps,
  label
}: {
  step: number
  totalSteps: number
  label: string
}) {
  const pct = (step / totalSteps) * 100
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] text-text-muted">
        <span>
          Step {step} of {totalSteps} · <span className="text-text">{label}</span>
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-[rgb(var(--accent))] transition-all duration-300 dark:bg-[rgb(var(--text))]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-border bg-bg-elevated p-8">
      {children}
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text">
        {label}
        {required && <span className="ml-1 text-text-muted">*</span>}
      </span>
      <div>{children}</div>
      {hint && <span className="mt-1 text-[12px] leading-snug text-text-muted">{hint}</span>}
    </label>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-[14px] text-text placeholder:text-text-muted focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
    />
  )
}

function TextAreaField({
  value,
  onChange,
  rows = 4,
  autoFocus
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, rows * 24)}px`
  }, [value, rows])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      autoFocus={autoFocus}
      className="w-full resize-none rounded-xl border border-border bg-bg px-3.5 py-3 text-[14px] leading-relaxed text-text placeholder:text-text-muted focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
    />
  )
}

function ChipSelect({
  options,
  labels,
  selected,
  onToggle
}: {
  options: readonly MentalState[]
  labels: Record<MentalState, string>
  selected: MentalState[]
  onToggle: (s: MentalState) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className={[
              'h-8 rounded-full border px-3 text-[12.5px] transition-colors',
              on
                ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text dark:border-text dark:bg-transparent dark:text-text'
                : 'border-border bg-bg text-text-muted hover:border-text/30 hover:text-text'
            ].join(' ')}
          >
            {labels[opt]}
          </button>
        )
      })}
    </div>
  )
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm
}: {
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-[360px] rounded-2xl border border-border bg-bg-elevated p-6 shadow-xl">
        <h3 className="font-serif text-[20px] font-medium text-text">{title}</h3>
        <p className="mt-1 text-[12.5px] text-text-muted">{description}</p>
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
            className={[
              'rounded-md border px-3 py-1.5 text-[12.5px]',
              danger
                ? 'border-red-500/50 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] text-accent-text hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text'
            ].join(' ')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
