import type { MentalState } from '@shared/ipc-contract'

export interface AnalyticsSummary {
  totalDecisions: number
  reviewedCount: number
  overdueCount: number
  upcomingReviewCount: number
  avgDaysBetweenDecisions: number | null
}

export interface TimelineBin {
  label: string
  period: string
  count: number
}

export interface MentalStateCount {
  state: MentalState
  label: string
  count: number
  percentage: number
}

export interface ReviewStatusBreakdown {
  reviewed: number
  pending: number
  overdue: number
  noReviewScheduled: number
}

export interface MentalStateTrend {
  period: string
  label: string
  [key: string]: string | number
}

export interface AnalyticsData {
  summary: AnalyticsSummary
  timeline: TimelineBin[]
  mentalStates: MentalStateCount[]
  reviewStatus: ReviewStatusBreakdown
  trends: MentalStateTrend[]
  topTrendStates: MentalState[]
}
