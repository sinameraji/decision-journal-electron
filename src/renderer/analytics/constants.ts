import type { MentalState } from '@shared/ipc-contract'

export const MENTAL_STATE_COLORS: Record<MentalState, string> = {
  energized: '#4a9e6b',
  focused: '#3a7ca5',
  relaxed: '#6b9e8a',
  confident: '#2e7d6e',
  tired: '#b8a07e',
  accepting: '#c4a854',
  accommodating: '#a89068',
  anxious: '#c47a4a',
  resigned: '#9e8a7a',
  frustrated: '#c45a3a',
  angry: '#a83a2a'
}

export const MIN_DECISIONS_FOR_TRENDS = 3
export const MIN_MONTHS_FOR_TREND = 2
export const TOP_STATES_COUNT = 5
