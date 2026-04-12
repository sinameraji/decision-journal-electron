import type { CategoryStatRow } from '@shared/ipc-contract'

const LABELS: Record<string, string> = {
  career: 'Career',
  money: 'Money',
  relationships: 'Relationships',
  health: 'Health',
  creative: 'Creative',
  other: 'Other'
}

export default function CategoryTable({ rows }: { rows: CategoryStatRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-text-muted">
        No categorized decisions yet.
      </p>
    )
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-bg text-left text-text-muted">
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 text-right font-medium">Logged</th>
            <th className="px-4 py-2.5 text-right font-medium">Reviewed</th>
            <th className="px-4 py-2.5 text-right font-medium">Hit rate</th>
            <th className="px-4 py-2.5 text-right font-medium">Avg conf.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.category}
              className={i % 2 === 0 ? 'bg-bg-elevated' : 'bg-bg-elevated/60'}
            >
              <td className="px-4 py-2.5 font-medium text-text">
                {LABELS[row.category] ?? row.category}
              </td>
              <td className="px-4 py-2.5 text-right text-text">{row.count}</td>
              <td className="px-4 py-2.5 text-right text-text-muted">{row.resolved}</td>
              <td className="px-4 py-2.5 text-right text-text">
                {row.hitRate != null ? `${Math.round(row.hitRate * 100)}%` : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-text-muted">
                {row.meanConfidence != null ? `${Math.round(row.meanConfidence)}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
