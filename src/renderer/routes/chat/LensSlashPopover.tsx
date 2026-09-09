import { useEffect, useMemo, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { LENS_DESCRIPTIONS, LENS_KINDS, LENS_LABELS } from '@shared/ipc-contract'
import type { LensSelection } from '@shared/ai'
import type { BorrowedFramework } from '@shared/roleModels'
import { avatarHue, initialsFor } from '@shared/roleModels'

/** One row in the picker: either a built-in lens or one borrowed from a person. */
export interface FrameOption {
  selection: LensSelection
  label: string
  description: string
  /** Set when the frame came from a role model rather than the app. */
  borrowedFrom: string | null
  /** True for the "all of this person's frameworks" entry. */
  wholePerson?: boolean
}

export function buildFrameOptions(borrowed: BorrowedFramework[]): FrameOption[] {
  const builtin: FrameOption[] = LENS_KINDS.map((kind) => ({
    selection: { kind: 'builtin', lens: kind },
    label: LENS_LABELS[kind],
    description: LENS_DESCRIPTIONS[kind],
    borrowedFrom: null
  }))

  // Each person leads with their whole toolkit, then the individual frames.
  // Picking one frame is a sharp instrument; picking the person asks how they
  // would approach the decision at all, which is usually what you want first.
  const byPerson = new Map<string, BorrowedFramework[]>()
  for (const f of borrowed) {
    const list = byPerson.get(f.roleModelId) ?? []
    list.push(f)
    byPerson.set(f.roleModelId, list)
  }

  const fromPeople: FrameOption[] = []
  for (const [roleModelId, frameworks] of byPerson) {
    const person = frameworks[0].personName
    fromPeople.push({
      selection: { kind: 'person', roleModelId },
      label: `How ${person} would approach this`,
      description: `All ${frameworks.length} of their frameworks — they pick the ones that apply.`,
      borrowedFrom: person,
      wholePerson: true
    })
    for (const f of frameworks) {
      fromPeople.push({
        selection: { kind: 'borrowed', frameworkId: f.id },
        label: f.name,
        description: f.summary,
        borrowedFrom: person,
        wholePerson: false
      })
    }
  }

  return [...builtin, ...fromPeople]
}

export function filterFrames(options: FrameOption[], query: string): FrameOption[] {
  const q = query.trim().toLowerCase()
  if (q === '') return options
  return options.filter((o) => {
    const hay = [o.label, o.description, o.borrowedFrom ?? ''].join(' ').toLowerCase()
    return hay.includes(q) || hay.replace(/\s/g, '').includes(q)
  })
}

export default function LensSlashPopover({
  results,
  activeIndex,
  onHoverIndex,
  onSelect
}: {
  results: FrameOption[]
  activeIndex: number
  onHoverIndex: (idx: number) => void
  onSelect: (option: FrameOption) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-frame-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const grouped = useMemo(
    () => ({
      builtin: results.filter((o) => !o.borrowedFrom),
      borrowed: results.filter((o) => o.borrowedFrom)
    }),
    [results]
  )

  let index = -1

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <Sparkles size={11} strokeWidth={2} />
        Frame
      </div>
      <div ref={listRef} className="max-h-[300px] overflow-y-auto py-1">
        {results.length === 0 ? (
          <div className="px-3.5 py-3 text-[12px] text-text-muted">No matching frame.</div>
        ) : (
          <>
            {grouped.builtin.map((o) => {
              index += 1
              return (
                <Row
                  key={o.label}
                  option={o}
                  index={index}
                  active={index === activeIndex}
                  onHover={onHoverIndex}
                  onSelect={onSelect}
                />
              )
            })}
            {grouped.borrowed.length > 0 && (
              <div className="mt-1 border-t border-border/60 px-3.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                Borrowed from your role models
              </div>
            )}
            {grouped.borrowed.map((o) => {
              index += 1
              return (
                <Row
                  key={o.selection.kind === 'borrowed' ? o.selection.frameworkId : o.label}
                  option={o}
                  index={index}
                  active={index === activeIndex}
                  onHover={onHoverIndex}
                  onSelect={onSelect}
                />
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function Row({
  option,
  index,
  active,
  onHover,
  onSelect
}: {
  option: FrameOption
  index: number
  active: boolean
  onHover: (idx: number) => void
  onSelect: (o: FrameOption) => void
}) {
  return (
    <button
      type="button"
      data-frame-index={index}
      onMouseEnter={() => onHover(index)}
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect(option)
      }}
      className={[
        'flex w-full items-start gap-2.5 py-2 pr-3.5 text-left',
        option.borrowedFrom && !option.wholePerson ? 'pl-7' : 'pl-3.5',
        active ? 'bg-nav-active' : ''
      ].join(' ')}
    >
      {option.borrowedFrom ? (
        <Avatar name={option.borrowedFrom} size={option.wholePerson ? 22 : 20} />
      ) : (
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-bg text-text-muted">
          <Sparkles size={10} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={[
              'truncate text-[12.5px] text-text',
              option.wholePerson ? 'font-semibold' : 'font-medium'
            ].join(' ')}
          >
            {option.label}
          </span>
          {option.borrowedFrom && !option.wholePerson && (
            <span className="shrink-0 text-[10.5px] text-text-muted">{option.borrowedFrom}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-text-muted">
          {option.description}
        </span>
      </span>
    </button>
  )
}

/** Initials, not a photograph — remote images would mean opening the network gate. */
export function Avatar({ name, size = 20 }: { name: string; size?: number }) {
  const hue = avatarHue(name)
  return (
    <span
      className="mt-0.5 flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${hue} 45% 88%)`,
        color: `hsl(${hue} 55% 28%)`
      }}
      title={name}
      aria-hidden
    >
      {initialsFor(name)}
    </span>
  )
}
