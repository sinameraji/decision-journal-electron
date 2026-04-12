import type { CadenceDay } from '@shared/ipc-contract'

const CELL = 12
const GAP = 3

export default function CadenceHeatmap({ days }: { days: CadenceDay[] }) {
  if (days.length === 0) {
    return <p className="text-[13px] text-text-muted">Start logging to see your cadence.</p>
  }

  // Pad start so first column begins on Sunday.
  const firstDate = new Date(days[0].date)
  const startDow = firstDate.getDay() // 0 = Sunday
  const padded: Array<CadenceDay | null> = [
    ...Array.from({ length: startDow }, () => null),
    ...days
  ]

  const weeks = Math.ceil(padded.length / 7)
  const maxCount = Math.max(1, ...days.map((d) => d.count))

  const width = weeks * (CELL + GAP)
  const height = 7 * (CELL + GAP)

  function color(count: number): string {
    if (count === 0) return 'rgb(var(--border))'
    const intensity = Math.min(1, 0.3 + (count / maxCount) * 0.7)
    return `rgb(var(--text) / ${intensity})`
  }

  // Month labels: show month when the first day of that month falls inside a week column.
  const monthLabels: Array<{ x: number; label: string }> = []
  let lastMonth = -1
  for (let i = 0; i < padded.length; i++) {
    const day = padded[i]
    if (!day) continue
    const d = new Date(day.date)
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth()
      const weekIdx = Math.floor(i / 7)
      monthLabels.push({
        x: weekIdx * (CELL + GAP),
        label: d.toLocaleString('en-US', { month: 'short' })
      })
    }
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width={width}
        height={height + 22}
        role="img"
        aria-label="Decision logging cadence"
      >
        {monthLabels.map((m, i) => (
          <text
            key={i}
            x={m.x}
            y={10}
            className="fill-text-muted"
            style={{ fontSize: 10 }}
          >
            {m.label}
          </text>
        ))}
        <g transform="translate(0, 16)">
          {padded.map((day, i) => {
            if (!day) return null
            const col = Math.floor(i / 7)
            const row = i % 7
            return (
              <rect
                key={day.date}
                x={col * (CELL + GAP)}
                y={row * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                ry={2}
                fill={color(day.count)}
              >
                <title>{`${day.date}: ${day.count} decision${day.count === 1 ? '' : 's'}`}</title>
              </rect>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
