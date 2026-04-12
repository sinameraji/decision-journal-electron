import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { ReviewStatusBreakdown } from '../types'
import ChartCard from './ChartCard'
import ChartTooltip from './ChartTooltip'

interface ReviewStatusProps {
  data: ReviewStatusBreakdown
  totalDecisions: number
}

const COLORS = {
  reviewed: '#4a9e6b',
  pending: '#c4a854',
  overdue: '#c45a3a'
}

export default function ReviewStatus({ data, totalDecisions }: ReviewStatusProps) {
  const segments = [
    { name: 'Reviewed', value: data.reviewed, color: COLORS.reviewed },
    { name: 'Pending', value: data.pending, color: COLORS.pending },
    { name: 'Overdue', value: data.overdue, color: COLORS.overdue }
  ].filter((s) => s.value > 0)

  const hasAnyReviewData = data.reviewed + data.pending + data.overdue > 0

  return (
    <ChartCard title="Review Status" subtitle="Follow-through on past decisions">
      {!hasAnyReviewData ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-[28px] font-serif font-medium text-text">{totalDecisions}</p>
          <p className="mt-1 text-[12px] text-text-muted">
            No reviews scheduled yet. Set review dates when capturing decisions.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie
                data={segments}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                strokeWidth={0}
              >
                {segments.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2">
            {segments.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-[12px]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-text-muted">{s.name}</span>
                <span className="font-medium text-text">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  )
}
