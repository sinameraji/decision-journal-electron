import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MentalStateCount } from '../types'
import { MENTAL_STATE_COLORS } from '../constants'
import ChartCard from './ChartCard'
import ChartTooltip from './ChartTooltip'
import EmptyChart from './EmptyChart'

interface MentalStateDistributionProps {
  data: MentalStateCount[]
}

export default function MentalStateDistribution({ data }: MentalStateDistributionProps) {
  if (data.length === 0) {
    return (
      <ChartCard title="Mental States">
        <EmptyChart message="Tag mental states on your decisions to see patterns." />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Mental States" subtitle="How you feel when deciding">
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
        >
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={100}
            tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--border))', opacity: 0.5 }} />
          <Bar dataKey="count" name="Times tagged" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((entry) => (
              <Cell key={entry.state} fill={MENTAL_STATE_COLORS[entry.state]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
