import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useDecisionsStore } from '../store/decisions'
import { computeAll } from '../analytics/compute'
import SummaryCards from '../analytics/components/SummaryCards'
import DecisionTimeline from '../analytics/components/DecisionTimeline'
import MentalStateDistribution from '../analytics/components/MentalStateDistribution'
import ReviewStatus from '../analytics/components/ReviewStatus'
import MentalStateOverTime from '../analytics/components/MentalStateOverTime'

export default function Analytics() {
  const navigate = useNavigate()
  const results = useDecisionsStore((s) => s.results)
  const loadAll = useDecisionsStore((s) => s.loadAll)

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const analytics = useMemo(() => computeAll(results), [results])

  if (results.length === 0) {
    return (
      <div className="mx-auto max-w-[780px]">
        <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
          Analytics
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Measure your decision quality over time.
        </p>
        <div className="mt-16 rounded-2xl border border-dashed border-border bg-bg-elevated/40 px-8 py-16 text-center">
          <p className="font-serif text-[22px] text-text">No decisions yet</p>
          <p className="mt-2 text-[13px] text-text-muted">
            Record your first decision to start seeing patterns.
          </p>
          <button
            type="button"
            onClick={() => navigate('/new')}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--accent))] bg-[rgb(var(--accent))] px-4 py-2.5 text-[13px] font-medium text-accent-text transition-colors hover:opacity-90 dark:bg-transparent dark:border-border dark:text-text"
          >
            <Plus size={15} strokeWidth={2} />
            New Decision
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[780px] pb-10">
      <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
        Analytics
      </h1>
      <p className="mt-1 text-[13px] text-text-muted">
        {results.length} decision{results.length === 1 ? '' : 's'} analyzed
      </p>

      <div className="mt-8">
        <SummaryCards data={analytics.summary} />
      </div>

      <div className="mt-6">
        <DecisionTimeline data={analytics.timeline} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MentalStateDistribution data={analytics.mentalStates} />
        <ReviewStatus data={analytics.reviewStatus} totalDecisions={analytics.summary.totalDecisions} />
      </div>

      <div className="mt-6">
        <MentalStateOverTime data={analytics.trends} topStates={analytics.topTrendStates} />
      </div>
    </div>
  )
}
