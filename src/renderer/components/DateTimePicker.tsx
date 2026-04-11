import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus
} from 'lucide-react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startWeekday = first.getDay()
  const start = new Date(year, month, 1 - startWeekday)
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return cells
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function formatDateTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function parseDateString(s: string): Date {
  if (!s) return startOfDay(new Date())
  const d = new Date(`${s}T12:00`)
  return Number.isFinite(d.getTime()) ? d : startOfDay(new Date())
}

function parseDateTimeString(s: string): Date {
  if (!s) return new Date()
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d : new Date()
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toDateTimeString(d: Date): string {
  return `${toDateString(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface CalendarProps {
  value: Date
  onChange: (d: Date) => void
  showToday?: boolean
}

function CalendarGrid({ value, onChange, showToday = true }: CalendarProps) {
  const [viewYear, setViewYear] = useState(value.getFullYear())
  const [viewMonth, setViewMonth] = useState(value.getMonth())

  useEffect(() => {
    setViewYear(value.getFullYear())
    setViewMonth(value.getMonth())
  }, [value])

  const today = startOfDay(new Date())
  const selected = startOfDay(value)
  const cells = useMemo(() => monthMatrix(viewYear, viewMonth), [viewYear, viewMonth])

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  })

  const go = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  const selectDay = (d: Date) => {
    const next = new Date(value)
    next.setFullYear(d.getFullYear())
    next.setMonth(d.getMonth())
    next.setDate(d.getDate())
    onChange(next)
  }

  const jumpToToday = () => {
    const now = new Date()
    const next = new Date(value)
    next.setFullYear(now.getFullYear())
    next.setMonth(now.getMonth())
    next.setDate(now.getDate())
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
    onChange(next)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[13px] font-medium text-text">{monthLabel}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-nav-active hover:text-text"
          >
            <ChevronLeft size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next month"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-nav-active hover:text-text"
          >
            <ChevronRight size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="flex h-7 items-center justify-center text-[10.5px] font-medium uppercase tracking-wide text-text-muted"
          >
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === viewMonth
          const isToday = d.getTime() === today.getTime()
          const isSelected = d.getTime() === selected.getTime()
          return (
            <button
              key={`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`}
              type="button"
              onClick={() => selectDay(d)}
              className={[
                'flex h-8 w-8 items-center justify-center rounded-md text-[12.5px] transition-colors',
                isSelected
                  ? 'bg-[rgb(var(--accent))] font-semibold text-accent-text dark:bg-[rgb(var(--text))] dark:text-bg'
                  : inMonth
                    ? 'text-text hover:bg-nav-active'
                    : 'text-text-muted/40 hover:bg-nav-active/60',
                !isSelected && isToday ? 'ring-1 ring-text/30' : ''
              ].join(' ')}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>

      {showToday && (
        <div className="mt-2 flex justify-end border-t border-border pt-2">
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded-md px-2 py-1 text-[11.5px] text-text-muted hover:bg-nav-active hover:text-text"
          >
            Today
          </button>
        </div>
      )}
    </div>
  )
}

interface PopoverProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  anchorRef: React.RefObject<HTMLButtonElement>
}

function Popover({ open, onClose, children, anchorRef }: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        !popoverRef.current?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-40 mt-2 w-[288px] rounded-xl border border-border bg-bg-elevated p-3 shadow-[0_10px_30px_rgb(0_0_0_/0.15)]"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function TriggerButton({
  value,
  open,
  onClick,
  buttonRef
}: {
  value: string
  open: boolean
  onClick: () => void
  buttonRef: React.RefObject<HTMLButtonElement>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex h-11 w-full items-center justify-between rounded-xl border border-border bg-bg px-3.5 text-left text-[14px] text-text transition-colors hover:border-text/30 focus:border-text/40 focus:outline-none focus:ring-2 focus:ring-text/10"
    >
      <span>{value}</span>
      <CalendarIcon size={15} strokeWidth={1.75} className="text-text-muted" />
    </button>
  )
}

export function DatePicker({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const current = parseDateString(value)

  return (
    <div className="relative">
      <TriggerButton
        value={formatDate(current)}
        open={open}
        onClick={() => setOpen((v) => !v)}
        buttonRef={anchorRef}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <CalendarGrid
          value={current}
          onChange={(d) => {
            onChange(toDateString(d))
            setOpen(false)
          }}
        />
      </Popover>
    </div>
  )
}

export function DateTimePicker({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const current = parseDateTimeString(value)

  const adjustHour = (delta: number) => {
    const next = new Date(current)
    next.setHours((next.getHours() + delta + 24) % 24)
    onChange(toDateTimeString(next))
  }

  const adjustMinute = (delta: number) => {
    const next = new Date(current)
    next.setMinutes((next.getMinutes() + delta + 60) % 60)
    onChange(toDateTimeString(next))
  }

  const onDayChange = (d: Date) => {
    const next = new Date(current)
    next.setFullYear(d.getFullYear())
    next.setMonth(d.getMonth())
    next.setDate(d.getDate())
    onChange(toDateTimeString(next))
  }

  return (
    <div className="relative">
      <TriggerButton
        value={formatDateTime(current)}
        open={open}
        onClick={() => setOpen((v) => !v)}
        buttonRef={anchorRef}
      />
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        <CalendarGrid value={current} onChange={onDayChange} showToday={false} />

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-muted">
            Time
          </span>
          <div className="flex items-center gap-1">
            <TimeSpinner value={pad(current.getHours())} onStep={adjustHour} label="hour" />
            <span className="text-[14px] text-text-muted">:</span>
            <TimeSpinner
              value={pad(current.getMinutes())}
              onStep={adjustMinute}
              label="minute"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-border bg-bg px-2.5 py-1 text-[11.5px] text-text hover:bg-nav-active"
          >
            Done
          </button>
        </div>
      </Popover>
    </div>
  )
}

function TimeSpinner({
  value,
  onStep,
  label
}: {
  value: string
  onStep: (delta: number) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-bg px-1 py-0.5">
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label={`Decrement ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-nav-active hover:text-text"
      >
        <Minus size={11} strokeWidth={2} />
      </button>
      <span className="min-w-[24px] text-center font-mono text-[13px] text-text">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label={`Increment ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-nav-active hover:text-text"
      >
        <Plus size={11} strokeWidth={2} />
      </button>
    </div>
  )
}
