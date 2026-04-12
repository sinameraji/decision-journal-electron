import type { CalibrationData } from '@shared/ipc-contract'

const W = 640
const H = 360
const PAD_L = 52
const PAD_R = 20
const PAD_T = 16
const PAD_B = 44

function xScale(pct: number): number {
  return PAD_L + (pct / 100) * (W - PAD_L - PAD_R)
}

function yScale(pct: number): number {
  return H - PAD_B - (pct / 100) * (H - PAD_T - PAD_B)
}

export default function CalibrationChart({ data }: { data: CalibrationData }) {
  const maxCount = Math.max(1, ...data.buckets.map((b) => b.count))
  const gridTicks = [0, 25, 50, 75, 100]

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Calibration chart"
      >
        {/* grid */}
        {gridTicks.map((t) => (
          <g key={`gx-${t}`}>
            <line
              x1={xScale(t)}
              x2={xScale(t)}
              y1={yScale(0)}
              y2={yScale(100)}
              stroke="rgb(var(--border))"
              strokeWidth={1}
            />
            <text
              x={xScale(t)}
              y={H - PAD_B + 18}
              textAnchor="middle"
              className="fill-text-muted"
              style={{ fontSize: 11 }}
            >
              {t}%
            </text>
          </g>
        ))}
        {gridTicks.map((t) => (
          <g key={`gy-${t}`}>
            <line
              x1={xScale(0)}
              x2={xScale(100)}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="rgb(var(--border))"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 10}
              y={yScale(t) + 4}
              textAnchor="end"
              className="fill-text-muted"
              style={{ fontSize: 11 }}
            >
              {t}%
            </text>
          </g>
        ))}

        {/* perfect calibration diagonal */}
        <line
          x1={xScale(0)}
          y1={yScale(0)}
          x2={xScale(100)}
          y2={yScale(100)}
          stroke="rgb(var(--text-muted))"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {/* axis labels */}
        <text
          x={(xScale(0) + xScale(100)) / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: 12 }}
        >
          Stated confidence
        </text>
        <text
          transform={`rotate(-90, 14, ${(yScale(0) + yScale(100)) / 2})`}
          x={14}
          y={(yScale(0) + yScale(100)) / 2}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: 12 }}
        >
          How often it happened
        </text>

        {/* buckets */}
        {data.buckets.map((b, i) => {
          if (b.count === 0 || b.hitRate == null) return null
          const mid = (b.lower + b.upper) / 2
          const cx = xScale(mid)
          const cy = yScale(b.hitRate * 100)
          const radius = 5 + 9 * Math.sqrt(b.count / maxCount)
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={yScale(mid)}
                x2={cx}
                y2={cy}
                stroke="rgb(var(--text-muted))"
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.6}
              />
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                className="fill-text"
                opacity={0.9}
              />
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgb(var(--bg-elevated))" strokeWidth={1.5} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
