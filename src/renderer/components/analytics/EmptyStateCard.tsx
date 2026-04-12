import type { ReactNode } from 'react'

export default function EmptyStateCard({
  title,
  what,
  why,
  unlockHint
}: {
  title: string
  what: ReactNode
  why: ReactNode
  unlockHint: string
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-bg-elevated/50 px-6 py-6">
      <header>
        <h3 className="font-serif text-[20px] font-medium leading-tight text-text">{title}</h3>
      </header>
      <div className="mt-4 space-y-2.5 text-[13px] leading-relaxed text-text-muted">
        <p>
          <span className="font-medium text-text">What it is — </span>
          {what}
        </p>
        <p>
          <span className="font-medium text-text">Why it matters — </span>
          {why}
        </p>
      </div>
      <div className="mt-4 inline-block rounded-full border border-border bg-bg px-3 py-1 text-[11.5px] text-text-muted">
        {unlockHint}
      </div>
    </section>
  )
}
