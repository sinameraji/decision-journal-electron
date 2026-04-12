interface ChartCardProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export default function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-5 py-5">
      <h3 className="text-[13.5px] font-medium text-text">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[12px] text-text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}
