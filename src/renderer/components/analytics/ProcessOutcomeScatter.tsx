import type { ProcessOutcomePoint } from '@shared/ipc-contract'

const W = 380
const H = 380
const PAD_L = 58
const PAD_R = 16
const PAD_T = 16
const PAD_B = 44

function xScale(v: number): number {
  return PAD_L + ((v - 0.5) / 5) * (W - PAD_L - PAD_R)
}
function yScale(v: number): number {
  return H - PAD_B - ((v - 0.5) / 5) * (H - PAD_T - PAD_B)
}

// Deterministic jitter so repeated renders are stable.
function jitter(id: string, axis: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i) + axis * 97) | 0
  return (((h % 1000) + 1000) % 1000) / 1000 - 0.5 // [-0.5, 0.5)
}

export default function ProcessOutcomeScatter({ points }: { points: ProcessOutcomePoint[] }) {
  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Process vs outcome scatter"
      >
        {/* cells */}
        {[1, 2, 3, 4].map((i) => (
          <g key={`grid-${i}`}>
            <line
              x1={xScale(i + 0.5)}
              x2={xScale(i + 0.5)}
              y1={yScale(0.5)}
              y2={yScale(5.5)}
              stroke="rgb(var(--border))"
            />
            <line
              x1={xScale(0.5)}
              x2={xScale(5.5)}
              y1={yScale(i + 0.5)}
              y2={yScale(i + 0.5)}
              stroke="rgb(var(--border))"
            />
          </g>
        ))}

        {/* quadrant labels */}
        <text
          x={xScale(1.5)}
          y={yScale(4.75)}
          className="fill-text-muted"
          style={{ fontSize: 10 }}
          textAnchor="middle"
        >
          Lucky
        </text>
        <text
          x={xScale(4.5)}
          y={yScale(4.75)}
          className="fill-text-muted"
          style={{ fontSize: 10 }}
          textAnchor="middle"
        >
          Earned it
        </text>
        <text
          x={xScale(1.5)}
          y={yScale(1.25)}
          className="fill-text-muted"
          style={{ fontSize: 10 }}
          textAnchor="middle"
        >
          Deserved it
        </text>
        <text
          x={xScale(4.5)}
          y={yScale(1.25)}
          className="fill-text-muted"
          style={{ fontSize: 10 }}
          textAnchor="middle"
        >
          Unlucky
        </text>

        {/* diagonal */}
        <line
          x1={xScale(0.5)}
          y1={yScale(0.5)}
          x2={xScale(5.5)}
          y2={yScale(5.5)}
          stroke="rgb(var(--text-muted))"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* tick labels */}
        {[1, 2, 3, 4, 5].map((n) => (
          <g key={`t-${n}`}>
            <text
              x={xScale(n)}
              y={H - PAD_B + 16}
              textAnchor="middle"
              className="fill-text-muted"
              style={{ fontSize: 11 }}
            >
              {n}
            </text>
            <text
              x={PAD_L - 10}
              y={yScale(n) + 4}
              textAnchor="end"
              className="fill-text-muted"
              style={{ fontSize: 11 }}
            >
              {n}
            </text>
          </g>
        ))}

        {/* axis labels */}
        <text
          x={(xScale(0.5) + xScale(5.5)) / 2}
          y={H - 6}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: 12 }}
        >
          Process quality →
        </text>
        <text
          transform={`rotate(-90, 16, ${(yScale(0.5) + yScale(5.5)) / 2})`}
          x={16}
          y={(yScale(0.5) + yScale(5.5)) / 2}
          textAnchor="middle"
          className="fill-text-muted"
          style={{ fontSize: 12 }}
        >
          Outcome quality →
        </text>

        {/* points */}
        {points.map((p) => {
          const px = p.processQuality + jitter(p.id, 1) * 0.4
          const py = p.outcomeQuality + jitter(p.id, 2) * 0.4
          return (
            <circle
              key={p.id}
              cx={xScale(px)}
              cy={yScale(py)}
              r={6}
              className="fill-text"
              opacity={0.75}
            />
          )
        })}
      </svg>
    </div>
  )
}
