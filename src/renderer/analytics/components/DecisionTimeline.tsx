import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { TimelineBin } from '../types'
import ChartCard from './ChartCard'
import ChartTooltip from './ChartTooltip'
import EmptyChart from './EmptyChart'

interface DecisionTimelineProps {
  data: TimelineBin[]
}

export default function DecisionTimeline({ data }: DecisionTimelineProps) {
  if (data.length === 0) {
    return (
      <ChartCard title="Decision Timeline">
        <EmptyChart message="Record decisions to see your activity over time." />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Decision Timeline" subtitle="Decisions recorded over time">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--border))', opacity: 0.5 }} />
          <Bar
            dataKey="count"
            name="Decisions"
            fill="rgb(var(--accent))"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
