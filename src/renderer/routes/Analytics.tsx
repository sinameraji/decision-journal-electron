import { useEffect, useState } from 'react'
import type {
  AnalyticsSummary,
  CadenceDay,
  CalibrationData,
  CategoryStatRow,
  ProcessOutcomePoint
} from '@shared/ipc-contract'
import MetricCard from '../components/analytics/MetricCard'
import EmptyStateCard from '../components/analytics/EmptyStateCard'
import CalibrationChart from '../components/analytics/CalibrationChart'
import ProcessOutcomeScatter from '../components/analytics/ProcessOutcomeScatter'
import CategoryTable from '../components/analytics/CategoryTable'
import CadenceHeatmap from '../components/analytics/CadenceHeatmap'

const CALIBRATION_THRESHOLD = 8
const PROCESS_OUTCOME_THRESHOLD = 6
const CATEGORY_THRESHOLD = 3

const CATEGORY_LABELS: Record<string, string> = {
  career: 'career',
  money: 'money',
  relationships: 'relationship',
  health: 'health',
  creative: 'creative',
  other: 'other'
}

export default function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [calibration, setCalibration] = useState<CalibrationData | null>(null)
  const [categoryStats, setCategoryStats] = useState<CategoryStatRow[]>([])
  const [processOutcome, setProcessOutcome] = useState<ProcessOutcomePoint[]>([])
  const [cadence, setCadence] = useState<CadenceDay[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.analytics.summary(),
      window.api.analytics.calibration(),
      window.api.analytics.categoryStats(),
      window.api.analytics.processOutcome(),
      window.api.analytics.cadence(365)
    ]).then(([s, c, cat, po, cad]) => {
      if (cancelled) return
      setSummary(s)
      setCalibration(c)
      setCategoryStats(cat)
      setProcessOutcome(po)
      setCadence(cad)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!summary || !calibration) {
    return <div className="mx-auto max-w-[860px]" />
  }

  const hasCalibration = calibration.totalResolved >= CALIBRATION_THRESHOLD
  const hasProcessOutcome = processOutcome.length >= PROCESS_OUTCOME_THRESHOLD
  const hasCategories =
    categoryStats.filter((r) => r.resolved > 0).reduce((a, b) => a + b.resolved, 0) >=
    CATEGORY_THRESHOLD
  const hasAnyDecisions = summary.totalDecisions > 0

  return (
    <div className="mx-auto max-w-[860px] pb-16">
      <header>
        <h1 className="font-serif text-[34px] font-medium leading-tight tracking-tight text-text">
          How your decisions have gone
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          {summaryLine(summary)}
        </p>
      </header>

      <div className="mt-8 flex flex-col gap-5">
        {hasCalibration ? (
          <MetricCard
            title="Calibration"
            subtitle="When you said X% confident, how often were you actually right?"
            takeaway={<CalibrationTakeaway data={calibration} />}
          >
            <CalibrationChart data={calibration} />
            <div className="mt-4 flex gap-8 text-[12px] text-text-muted">
              <div>
                <div className="font-medium text-text-muted">Brier score</div>
                <div className="font-serif text-[22px] text-text">
                  {calibration.brier != null ? calibration.brier.toFixed(3) : '—'}
                </div>
                <div className="text-[11px]">lower is better · 0 is perfect</div>
              </div>
              <div>
                <div className="font-medium text-text-muted">Resolved</div>
                <div className="font-serif text-[22px] text-text">{calibration.totalResolved}</div>
                <div className="text-[11px]">decisions with an outcome</div>
              </div>
            </div>
          </MetricCard>
        ) : (
          <EmptyStateCard
            title="Calibration"
            what={
              <>
                A chart of your stated confidence against how often you were actually right.
                Superforecasters, intelligence analysts, and prop-trading desks track this as
                their single most important skill metric.
              </>
            }
            why={
              <>
                It's the fastest way to see whether you're overconfident or underconfident —
                and it's the first thing that gets better when you pay attention to it.
              </>
            }
            unlockHint={`${Math.max(
              0,
              CALIBRATION_THRESHOLD - calibration.totalResolved
            )} more reviewed decisions until this unlocks`}
          />
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {hasProcessOutcome ? (
              <MetricCard
                title="Skill vs. luck"
                subtitle="Separating the decisions you got right from the ones that got you right."
                takeaway={<ProcessOutcomeTakeaway points={processOutcome} />}
              >
                <ProcessOutcomeScatter points={processOutcome} />
              </MetricCard>
            ) : (
              <EmptyStateCard
                title="Skill vs. luck"
                what={
                  <>
                    A scatter plot of how well you reasoned versus how well things turned out.
                    Points off the diagonal show where luck dominated skill — a distinction poker
                    players and hedge fund PMs live by.
                  </>
                }
                why={
                  <>
                    Judging yourself only on outcomes rewards luck. This plot lets you praise a
                    well-reasoned call that went wrong and flag a lucky call that went right.
                  </>
                }
                unlockHint={`${Math.max(
                  0,
                  PROCESS_OUTCOME_THRESHOLD - processOutcome.length
                )} more reviewed decisions until this unlocks`}
              />
            )}
          </div>
          <div className="lg:col-span-2">
            {hasCategories ? (
              <MetricCard
                title="By category"
                subtitle="Your hit rate, area by area."
                takeaway={<CategoryTakeaway rows={categoryStats} />}
              >
                <CategoryTable rows={categoryStats} />
              </MetricCard>
            ) : (
              <EmptyStateCard
                title="By category"
                what={
                  <>
                    Your hit rate split by life area — career, money, relationships, health,
                    creative, other. Kahneman calls this the "outside view."
                  </>
                }
                why={
                  <>
                    Knowing you're 85% on career calls but 40% on money calls changes how you
                    should weight your next decision in each area.
                  </>
                }
                unlockHint={`${Math.max(
                  0,
                  CATEGORY_THRESHOLD -
                    categoryStats.reduce((a, b) => a + b.resolved, 0)
                )} more reviewed decisions until this unlocks`}
              />
            )}
          </div>
        </div>

        {hasAnyDecisions && (
          <MetricCard
            title="Cadence"
            subtitle="Decisions logged over the last year."
          >
            <CadenceHeatmap days={cadence} />
          </MetricCard>
        )}
      </div>
    </div>
  )
}

// ---------- Takeaway generators ----------

function summaryLine(s: AnalyticsSummary): string {
  if (s.totalDecisions === 0) return 'No decisions yet. Log one to start.'
  const since =
    s.firstDecisionAt != null
      ? new Date(s.firstDecisionAt).toLocaleString('en-US', {
          month: 'long',
          year: 'numeric'
        })
      : ''
  const resolvedStr =
    s.totalResolved > 0 ? ` · ${s.totalResolved} reviewed` : ''
  return since
    ? `Since ${since} · ${s.totalDecisions} decision${s.totalDecisions === 1 ? '' : 's'}${resolvedStr}`
    : `${s.totalDecisions} decisions${resolvedStr}`
}

function CalibrationTakeaway({ data }: { data: CalibrationData }) {
  // Compute weighted confidence and hit rate across resolved decisions
  let weightedConf = 0
  let weightedHits = 0
  let totalCount = 0
  for (const b of data.buckets) {
    if (b.count === 0) continue
    const mid = (b.lower + b.upper) / 2
    weightedConf += mid * b.count
    weightedHits += b.hits
    totalCount += b.count
  }
  if (totalCount === 0) return null
  const avgConf = weightedConf / totalCount
  const hitRate = (weightedHits / totalCount) * 100
  const gap = avgConf - hitRate // positive = overconfident

  // Highest-confidence bucket performance (≥70%)
  let highCount = 0
  let highHits = 0
  let highConfWeighted = 0
  for (const b of data.buckets) {
    if (b.lower >= 70 && b.count > 0) {
      highCount += b.count
      highHits += b.hits
      highConfWeighted += ((b.lower + b.upper) / 2) * b.count
    }
  }

  if (Math.abs(gap) < 6) {
    return (
      <>
        You're <strong>well calibrated</strong> — your average stated confidence ({avgConf.toFixed(0)}%)
        matches your hit rate ({hitRate.toFixed(0)}%) within a few points. Keep stating confidence
        out loud; this is the discipline that keeps it there.
      </>
    )
  }

  if (gap > 0) {
    // Overconfident
    if (highCount >= 3) {
      const highAvg = highConfWeighted / highCount
      const highRate = (highHits / highCount) * 100
      return (
        <>
          You're <strong>overconfident</strong> — your average stated confidence ({avgConf.toFixed(0)}%)
          beats your actual hit rate ({hitRate.toFixed(0)}%). Your high-confidence calls (≥70%) averaged{' '}
          {highAvg.toFixed(0)}% confidence but hit only {highRate.toFixed(0)}% of the time. Next time
          you're "sure," try stating it 10–15 points lower — that's roughly where the ground truth is.
        </>
      )
    }
    return (
      <>
        You're <strong>overconfident</strong> — your average stated confidence ({avgConf.toFixed(0)}%)
        beats your actual hit rate ({hitRate.toFixed(0)}%) by about {gap.toFixed(0)} points. When you
        feel sure, try stating it {Math.round(gap)} points lower — that's where the data says you
        actually are.
      </>
    )
  }

  return (
    <>
      You're <strong>underconfident</strong> — your hit rate ({hitRate.toFixed(0)}%) beats your average
      stated confidence ({avgConf.toFixed(0)}%) by about {Math.abs(gap).toFixed(0)} points. Trust your
      instincts more; you're reading things better than you're willing to say.
    </>
  )
}

function ProcessOutcomeTakeaway({ points }: { points: ProcessOutcomePoint[] }) {
  // Quadrants relative to 3 (midpoint of 1-5)
  const lucky = points.filter((p) => p.processQuality < 3 && p.outcomeQuality > 3).length
  const unlucky = points.filter((p) => p.processQuality > 3 && p.outcomeQuality < 3).length
  const deserved = points.filter((p) => p.processQuality >= 3 && p.outcomeQuality >= 3).length

  if (lucky === 0 && unlucky === 0) {
    return (
      <>
        Every decision you've reviewed landed where your reasoning deserved it ({deserved} decisions
        on the diagonal). Either you're reading the world cleanly or the sample is still small —
        keep logging and see which.
      </>
    )
  }
  if (lucky > unlucky) {
    return (
      <>
        You got lucky on <strong>{lucky}</strong> decision{lucky === 1 ? '' : 's'} where the reasoning
        was weak but things worked out, versus <strong>{unlucky}</strong> where good reasoning ran into
        bad luck. Watch for the ones in the upper-left quadrant — they're the ones most likely to fool
        you into repeating a sloppy process.
      </>
    )
  }
  if (unlucky > lucky) {
    return (
      <>
        Good reasoning ran into bad luck on <strong>{unlucky}</strong> decision
        {unlucky === 1 ? '' : 's'}, versus <strong>{lucky}</strong> where weak reasoning still worked
        out. Don't rewrite your process based on the lower-right dots — the odds, not the outcome,
        were the problem.
      </>
    )
  }
  return (
    <>
      Lucky wins ({lucky}) and unlucky losses ({unlucky}) balance out. The decisions off the diagonal
      are your best learning material — they're the ones where outcome and process disagree.
    </>
  )
}

function CategoryTakeaway({ rows }: { rows: CategoryStatRow[] }) {
  const reviewable = rows.filter((r) => r.resolved >= 2 && r.hitRate != null)
  if (reviewable.length === 0) {
    return (
      <>
        Keep logging — once any category has 2+ reviewed decisions, you'll see where your instincts
        run hot and cold.
      </>
    )
  }

  // Largest gap between stated confidence and hit rate
  const withGap = reviewable
    .filter((r) => r.meanConfidence != null)
    .map((r) => ({
      row: r,
      gap: (r.meanConfidence as number) - (r.hitRate as number) * 100
    }))
  withGap.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  const worst = withGap[0]

  if (worst && Math.abs(worst.gap) >= 10) {
    const label = CATEGORY_LABELS[worst.row.category] ?? worst.row.category
    if (worst.gap > 0) {
      return (
        <>
          Your biggest blind spot is <strong>{label}</strong> — you averaged{' '}
          {Math.round(worst.row.meanConfidence as number)}% confidence but hit only{' '}
          {Math.round((worst.row.hitRate as number) * 100)}%. Treat your gut in this area with more
          skepticism.
        </>
      )
    }
    return (
      <>
        You're sharper at <strong>{label}</strong> than you give yourself credit for — your gut hits{' '}
        {Math.round((worst.row.hitRate as number) * 100)}% but you only stated{' '}
        {Math.round(worst.row.meanConfidence as number)}%. Raise your conviction here.
      </>
    )
  }

  const best = [...reviewable].sort(
    (a, b) => (b.hitRate as number) - (a.hitRate as number)
  )[0]
  const worstByRate = [...reviewable].sort(
    (a, b) => (a.hitRate as number) - (b.hitRate as number)
  )[0]
  return (
    <>
      Your best area is <strong>{CATEGORY_LABELS[best.category] ?? best.category}</strong> (
      {Math.round((best.hitRate as number) * 100)}%); weakest is{' '}
      <strong>{CATEGORY_LABELS[worstByRate.category] ?? worstByRate.category}</strong> (
      {Math.round((worstByRate.hitRate as number) * 100)}%). Weight your next call accordingly.
    </>
  )
}
