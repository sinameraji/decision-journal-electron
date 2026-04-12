import type { ReactNode } from 'react'

export default function MetricCard({
  title,
  subtitle,
  children,
  takeaway
}: {
  title: string
  subtitle?: string
  children: ReactNode
  takeaway?: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-elevated px-6 py-6">
      <header>
        <h3 className="font-serif text-[20px] font-medium leading-tight text-text">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-text-muted">{subtitle}</p>}
      </header>
      <div className="mt-5">{children}</div>
      {takeaway && (
        <div className="mt-5 border-t border-border pt-4 text-[13px] leading-relaxed text-text">
          {takeaway}
        </div>
      )}
    </section>
  )
}
