import { FileText, CheckCircle2, Clock, CalendarClock } from 'lucide-react'
import type { AnalyticsSummary } from '../types'

interface SummaryCardsProps {
  data: AnalyticsSummary
}

interface CardProps {
  icon: React.ReactNode
  value: string | number
  label: string
}

function Card({ icon, value, label }: CardProps) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-4 py-4">
      <div className="text-text-muted">{icon}</div>
      <p className="mt-2 font-serif text-[28px] font-medium leading-tight text-text">{value}</p>
      <p className="mt-0.5 text-[12px] text-text-muted">{label}</p>
    </div>
  )
}

export default function SummaryCards({ data }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card
        icon={<FileText size={16} strokeWidth={1.75} />}
        value={data.totalDecisions}
        label="Total decisions"
      />
      <Card
        icon={<CheckCircle2 size={16} strokeWidth={1.75} />}
        value={data.reviewedCount}
        label="Reviewed"
      />
      <Card
        icon={<Clock size={16} strokeWidth={1.75} />}
        value={data.avgDaysBetweenDecisions !== null ? `${data.avgDaysBetweenDecisions}d` : '---'}
        label="Avg. interval"
      />
      <Card
        icon={<CalendarClock size={16} strokeWidth={1.75} />}
        value={data.upcomingReviewCount}
        label="Upcoming reviews"
      />
    </div>
  )
}
