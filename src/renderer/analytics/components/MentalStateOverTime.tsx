import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { MentalState } from '@shared/ipc-contract'
import { MENTAL_STATE_LABELS } from '@shared/ipc-contract'
import type { MentalStateTrend } from '../types'
import { MENTAL_STATE_COLORS } from '../constants'
import ChartCard from './ChartCard'
import ChartTooltip from './ChartTooltip'
import EmptyChart from './EmptyChart'
import { TrendingUp } from 'lucide-react'

interface MentalStateOverTimeProps {
  data: MentalStateTrend[]
  topStates: MentalState[]
}

export default function MentalStateOverTime({ data, topStates }: MentalStateOverTimeProps) {
  if (data.length < 2 || topStates.length === 0) {
    return (
      <ChartCard title="Mental State Trends">
        <EmptyChart
          message="Record decisions across multiple months to see how your mental states trend over time."
          icon={TrendingUp}
        />
      </ChartCard>
    )
  }

  return (
    <ChartCard title="Mental State Trends" subtitle="Your top mental states over time">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
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
          <Tooltip content={<ChartTooltip />} />
          {topStates.map((state) => (
            <Area
              key={state}
              type="monotone"
              dataKey={state}
              name={MENTAL_STATE_LABELS[state]}
              stroke={MENTAL_STATE_COLORS[state]}
              fill={MENTAL_STATE_COLORS[state]}
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap gap-3">
        {topStates.map((state) => (
          <div key={state} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: MENTAL_STATE_COLORS[state] }}
            />
            <span className="text-text-muted">{MENTAL_STATE_LABELS[state]}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}
