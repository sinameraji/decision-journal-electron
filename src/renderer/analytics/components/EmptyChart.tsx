import type { LucideIcon } from 'lucide-react'
import { BarChart3 } from 'lucide-react'

interface EmptyChartProps {
  message: string
  icon?: LucideIcon
}

export default function EmptyChart({ message, icon: Icon = BarChart3 }: EmptyChartProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-bg-elevated/40 px-6 py-10 text-center">
      <Icon size={24} strokeWidth={1.5} className="text-text-muted" />
      <p className="mt-2 text-[12.5px] text-text-muted">{message}</p>
    </div>
  )
}
