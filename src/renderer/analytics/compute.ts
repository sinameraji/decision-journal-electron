import type { Decision, MentalState } from '@shared/ipc-contract'
import { MENTAL_STATE_LABELS } from '@shared/ipc-contract'
import { TOP_STATES_COUNT } from './constants'
import type {
  AnalyticsData,
  AnalyticsSummary,
  MentalStateCount,
  MentalStateTrend,
  ReviewStatusBreakdown,
  TimelineBin
} from './types'

function toMonthKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function toMonthLabel(period: string): string {
  const [y, m] = period.split('-')
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ]
  return `${months[parseInt(m, 10) - 1]} ${y}`
}

function toWeekKey(ts: number): string {
  const d = new Date(ts)
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil(
    ((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  )
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

function toWeekLabel(period: string): string {
  const [y, w] = period.split('-W')
  return `W${parseInt(w, 10)} ${y}`
}

function fillMonthGaps(bins: TimelineBin[]): TimelineBin[] {
  if (bins.length < 2) return bins
  const sorted = [...bins].sort((a, b) => a.period.localeCompare(b.period))
  const result: TimelineBin[] = []
  const start = sorted[0].period
  const end = sorted[sorted.length - 1].period
  const lookup = new Map(sorted.map((b) => [b.period, b.count]))

  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)

  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    result.push({ period: key, label: toMonthLabel(key), count: lookup.get(key) ?? 0 })
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return result
}

export function computeSummary(decisions: Decision[]): AnalyticsSummary {
  const now = Date.now()
  const total = decisions.length
  let reviewed = 0
  let overdue = 0
  let upcoming = 0

  for (const d of decisions) {
    if (d.reviewedAt) {
      reviewed++
    } else if (d.reviewAt) {
      if (d.reviewAt < now) overdue++
      else upcoming++
    }
  }

  let avgDays: number | null = null
  if (total >= 2) {
    const sorted = decisions
      .map((d) => d.decidedAt)
      .sort((a, b) => a - b)
    let totalDiff = 0
    for (let i = 1; i < sorted.length; i++) {
      totalDiff += sorted[i] - sorted[i - 1]
    }
    avgDays = Math.round(totalDiff / (sorted.length - 1) / 86400000)
  }

  return {
    totalDecisions: total,
    reviewedCount: reviewed,
    overdueCount: overdue,
    upcomingReviewCount: upcoming,
    avgDaysBetweenDecisions: avgDays
  }
}

export function computeTimeline(decisions: Decision[]): TimelineBin[] {
  if (decisions.length === 0) return []

  const sorted = [...decisions].sort((a, b) => a.decidedAt - b.decidedAt)
  const spanMs = sorted[sorted.length - 1].decidedAt - sorted[0].decidedAt
  const threeMonths = 90 * 86400000
  const useWeeks = spanMs < threeMonths && decisions.length > 1

  const groups = new Map<string, number>()
  for (const d of decisions) {
    const key = useWeeks ? toWeekKey(d.decidedAt) : toMonthKey(d.decidedAt)
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }

  const bins: TimelineBin[] = Array.from(groups.entries()).map(([period, count]) => ({
    period,
    label: useWeeks ? toWeekLabel(period) : toMonthLabel(period),
    count
  }))

  if (useWeeks) {
    return bins.sort((a, b) => a.period.localeCompare(b.period))
  }
  return fillMonthGaps(bins)
}

export function computeMentalStateDistribution(decisions: Decision[]): MentalStateCount[] {
  const counts = new Map<MentalState, number>()
  let total = 0

  for (const d of decisions) {
    for (const s of d.mentalState) {
      counts.set(s, (counts.get(s) ?? 0) + 1)
      total++
    }
  }

  if (total === 0) return []

  return Array.from(counts.entries())
    .map(([state, count]) => ({
      state,
      label: MENTAL_STATE_LABELS[state],
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count)
}

export function computeReviewStatus(decisions: Decision[]): ReviewStatusBreakdown {
  const now = Date.now()
  let reviewed = 0
  let pending = 0
  let overdue = 0
  let noReview = 0

  for (const d of decisions) {
    if (d.reviewedAt) reviewed++
    else if (!d.reviewAt) noReview++
    else if (d.reviewAt < now) overdue++
    else pending++
  }

  return { reviewed, pending, overdue, noReviewScheduled: noReview }
}

export function computeMentalStateTrend(
  decisions: Decision[]
): { trends: MentalStateTrend[]; topStates: MentalState[] } {
  // Find top N most frequent states overall
  const totalCounts = new Map<MentalState, number>()
  for (const d of decisions) {
    for (const s of d.mentalState) {
      totalCounts.set(s, (totalCounts.get(s) ?? 0) + 1)
    }
  }

  const topStates = Array.from(totalCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_STATES_COUNT)
    .map(([state]) => state)

  if (topStates.length === 0) return { trends: [], topStates: [] }

  // Group by month
  const monthData = new Map<string, Map<MentalState, number>>()
  for (const d of decisions) {
    const key = toMonthKey(d.decidedAt)
    if (!monthData.has(key)) monthData.set(key, new Map())
    const month = monthData.get(key)!
    for (const s of d.mentalState) {
      if (topStates.includes(s)) {
        month.set(s, (month.get(s) ?? 0) + 1)
      }
    }
  }

  // Fill gaps and build trend data
  const periods = Array.from(monthData.keys()).sort()
  if (periods.length < 2) return { trends: [], topStates }

  const filled: string[] = []
  let [y, m] = periods[0].split('-').map(Number)
  const [ey, em] = periods[periods.length - 1].split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    filled.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }

  const trends: MentalStateTrend[] = filled.map((period) => {
    const entry: MentalStateTrend = { period, label: toMonthLabel(period) }
    const month = monthData.get(period)
    for (const state of topStates) {
      entry[state] = month?.get(state) ?? 0
    }
    return entry
  })

  return { trends, topStates }
}

export function computeAll(decisions: Decision[]): AnalyticsData {
  const { trends, topStates } = computeMentalStateTrend(decisions)
  return {
    summary: computeSummary(decisions),
    timeline: computeTimeline(decisions),
    mentalStates: computeMentalStateDistribution(decisions),
    reviewStatus: computeReviewStatus(decisions),
    trends,
    topTrendStates: topStates
  }
}
