import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'
import {
  MENTAL_STATES,
  MENTAL_STATE_LABELS,
  parseAlternatives,
  serializeOptions,
  type Decision,
  type DecisionCreateInput,
  type DecisionOption,
  type MentalState
} from '@shared/ipc-contract'
import { DatePicker, DateTimePicker } from '../components/DateTimePicker'
import MicButton from '../components/voice/MicButton'

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
  options: DecisionOption[]
  migratedFromLegacy: boolean
  rangeOfOutcomes: string
  expectedOutcome: string
}

function makeBlankOption(chosen = false): DecisionOption {
  return { id: crypto.randomUUID(), name: '', note: '', chosen }
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
    options: [makeBlankOption(), makeBlankOption()],
    migratedFromLegacy: false,
    rangeOfOutcomes: '',
    expectedOutcome: ''
  }
}

function decisionToForm(d: Decision): FormState {
  const parsed = parseAlternatives(d.alternatives)
  let options: DecisionOption[]
  let migratedFromLegacy = false
  if (parsed.kind === 'structured') {
    options = parsed.options.length > 0 ? parsed.options : [makeBlankOption()]
  } else if (parsed.kind === 'legacy') {
    options = [{ id: crypto.randomUUID(), name: '', note: parsed.text, chosen: false }]
    migratedFromLegacy = true
  } else {
    options = [makeBlankOption()]
  }

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
    options,
    migratedFromLegacy,
    rangeOfOutcomes: d.rangeOfOutcomes,
    expectedOutcome: d.expectedOutcome
  }
}

function formToInput(f: FormState): DecisionCreateInput {
  const cleanedOptions = f.options
    .map((o) => ({ ...o, name: o.name.trim(), note: o.note.trim() }))
    .filter((o) => o.name !== '' || o.note !== '')
  const alternatives = cleanedOptions.length > 0 ? serializeOptions(cleanedOptions) : ''

  return {
    title: f.title.trim(),
    decidedAt: fromLocalDateTime(f.decidedAtLocal),
    reviewAt: f.reviewAtLocal ? fromLocalDate(f.reviewAtLocal) : null,
    mentalState: f.mentalState,
    situation: f.situation,
    problemStatement: f.problemStatement,
    variables: f.variables,
    complications: f.complications,
    alternatives,
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
      a.rangeOfOutcomes !== form.rangeOfOutcomes ||
      a.expectedOutcome !== form.expectedOutcome ||
      JSON.stringify(a.mentalState) !== JSON.stringify(form.mentalState) ||
      JSON.stringify(a.options) !== JSON.stringify(form.options)
    )
  }, [form])

  const updateOption = useCallback(
    (id: string, patchFields: Partial<Pick<DecisionOption, 'name' | 'note' | 'chosen'>>) => {
      setForm((prev) => ({
        ...prev,
        options: prev.options.map((o) => {
          if (o.id !== id) {
            return patchFields.chosen === true ? { ...o, chosen: false } : o
          }
          return { ...o, ...patchFields }
        })
      }))
    },
    []
  )

  const addOption = useCallback(() => {
    setForm((prev) => ({ ...prev, options: [...prev.options, makeBlankOption()] }))
  }, [])

  const removeOption = useCallback((id: string) => {
    setForm((prev) => {
      const next = prev.options.filter((o) => o.id !== id)
      return { ...prev, options: next.length > 0 ? next : [makeBlankOption()] }
    })
  }, [])

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
        const created = await window.api.decisions.create(input)
        navigate(`/decisions/${created.id}`)
      } else if (id) {
        await window.api.decisions.update(id, input)
        navigate(`/decisions/${id}`)
      } else {
        navigate('/decisions')
      }
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
              label="Options you considered"
              hint="Name at least two. Mark the one you picked. Use the notes for why you rejected the others, or what drew you to the one you chose."
            >
              <OptionsEditor
                options={form.options}
                migratedFromLegacy={form.migratedFromLegacy}
                onUpdate={updateOption}
                onAdd={addOption}
                onRemove={removeOption}
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
  const ref = useRef<HTMLInputElement>(null)

  const handleInsert = useCallback(
    (text: string) => {
      const el = ref.current
      if (el && el === document.activeElement) {
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        onChange(value.slice(0, start) + text + value.slice(end))
      } else {
        onChange(value ? value + ' ' + text : text)
      }
    },
    [value, onChange]
  )

  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-11 w-full rounded-xl border border-border bg-bg px-3.5 pr-10 text-[14px] text-text placeholder:text-text-muted focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
      />
      <div className="absolute bottom-0 right-1.5 top-0 flex items-center">
        <MicButton onInsert={handleInsert} />
      </div>
    </div>
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

  const handleInsert = useCallback(
    (text: string) => {
      const el = ref.current
      if (el && el === document.activeElement) {
        const start = el.selectionStart ?? value.length
        const end = el.selectionEnd ?? value.length
        onChange(value.slice(0, start) + text + value.slice(end))
      } else {
        onChange(value ? value + '\n' + text : text)
      }
    },
    [value, onChange]
  )

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        autoFocus={autoFocus}
        className="w-full resize-none rounded-xl border border-border bg-bg px-3.5 py-3 pr-10 text-[14px] leading-relaxed text-text placeholder:text-text-muted focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
      />
      <div className="absolute bottom-2 right-2">
        <MicButton onInsert={handleInsert} />
      </div>
    </div>
  )
}

function OptionsEditor({
  options,
  migratedFromLegacy,
  onUpdate,
  onAdd,
  onRemove
}: {
  options: DecisionOption[]
  migratedFromLegacy: boolean
  onUpdate: (
    id: string,
    patch: Partial<Pick<DecisionOption, 'name' | 'note' | 'chosen'>>
  ) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {migratedFromLegacy && (
        <div className="rounded-lg border border-dashed border-border bg-bg/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-text-muted">
          Your earlier free-text notes have been moved into the first option below. Edit them, split them up, or add more options.
        </div>
      )}

      {options.map((opt, idx) => (
        <OptionRow
          key={opt.id}
          option={opt}
          index={idx}
          canRemove={options.length > 1}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-1.5 self-start rounded-lg border border-dashed border-border bg-bg/40 px-3 py-2 text-[12.5px] text-text-muted hover:border-text/30 hover:text-text"
      >
        <Plus size={13} strokeWidth={2} />
        Add option
      </button>
    </div>
  )
}

function OptionRow({
  option,
  index,
  canRemove,
  onUpdate,
  onRemove
}: {
  option: DecisionOption
  index: number
  canRemove: boolean
  onUpdate: (
    id: string,
    patch: Partial<Pick<DecisionOption, 'name' | 'note' | 'chosen'>>
  ) => void
  onRemove: (id: string) => void
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = noteRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 3 * 24)}px`
  }, [option.note])

  const handleNoteInsert = useCallback(
    (text: string) => {
      const el = noteRef.current
      const v = option.note
      if (el && el === document.activeElement) {
        const start = el.selectionStart ?? v.length
        const end = el.selectionEnd ?? v.length
        onUpdate(option.id, { note: v.slice(0, start) + text + v.slice(end) })
      } else {
        onUpdate(option.id, { note: v ? v + '\n' + text : text })
      }
    },
    [option.id, option.note, onUpdate]
  )

  return (
    <div
      className={[
        'rounded-xl border bg-bg px-3.5 py-3 transition-colors',
        option.chosen
          ? 'border-[rgb(var(--accent))] dark:border-text'
          : 'border-border'
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <label className="flex shrink-0 cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="chosen-option"
            checked={option.chosen}
            onChange={() => onUpdate(option.id, { chosen: true })}
            className="peer sr-only"
          />
          <span
            className={[
              'flex h-4 w-4 items-center justify-center rounded-full border transition-colors',
              option.chosen
                ? 'border-[rgb(var(--accent))] bg-[rgb(var(--accent))] dark:border-text dark:bg-text'
                : 'border-border'
            ].join(' ')}
          >
            {option.chosen && (
              <span className="h-[6px] w-[6px] rounded-full bg-accent-text dark:bg-bg" />
            )}
          </span>
          <span className="text-[11.5px] uppercase tracking-wide text-text-muted">
            {option.chosen ? 'Chosen' : 'Pick'}
          </span>
        </label>

        <input
          type="text"
          value={option.name}
          onChange={(e) => onUpdate(option.id, { name: e.target.value })}
          placeholder={`Option ${index + 1} name`}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[13.5px] font-medium text-text placeholder:text-text-muted focus:border-border focus:outline-none"
        />

        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(option.id)}
            aria-label={`Remove option ${index + 1}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-nav-active hover:text-text"
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="relative mt-2">
        <textarea
          ref={noteRef}
          value={option.note}
          onChange={(e) => onUpdate(option.id, { note: e.target.value })}
          rows={3}
          placeholder="Notes — what was appealing, what was off, why you picked it or rejected it."
          className="w-full resize-none rounded-lg border border-border bg-bg-elevated px-3 py-2.5 pr-10 text-[13px] leading-relaxed text-text placeholder:text-text-muted focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
        />
        <div className="absolute bottom-2 right-2">
          <MicButton onInsert={handleNoteInsert} />
        </div>
      </div>
    </div>
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
