interface TooltipPayloadEntry {
  name?: string
  value?: number
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

export default function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 shadow-lg">
      {label && <p className="mb-1 text-[11.5px] font-medium text-text">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 text-[11.5px]">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-text-muted">{entry.name}:</span>
          <span className="font-medium text-text">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}
