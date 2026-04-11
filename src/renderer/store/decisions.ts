import { create } from 'zustand'
import type { Decision } from '@shared/ipc-contract'

interface DecisionsState {
  query: string
  results: Decision[]
  loading: boolean
  loadAll: () => Promise<void>
  setQuery: (q: string) => void
  refresh: () => Promise<void>
}

let searchToken = 0

async function runQuery(q: string): Promise<Decision[]> {
  const trimmed = q.trim()
  return trimmed === ''
    ? window.api.decisions.list()
    : window.api.decisions.search(trimmed)
}

export const useDecisionsStore = create<DecisionsState>((set, get) => ({
  query: '',
  results: [],
  loading: false,

  loadAll: async () => {
    set({ loading: true })
    const results = await window.api.decisions.list()
    set({ results, loading: false })
  },

  setQuery: (q: string) => {
    set({ query: q })
    const token = ++searchToken
    setTimeout(async () => {
      if (token !== searchToken) return
      const results = await runQuery(q)
      if (token !== searchToken) return
      set({ results })
    }, 120)
  },

  refresh: async () => {
    const token = ++searchToken
    const results = await runQuery(get().query)
    if (token !== searchToken) return
    set({ results })
  }
}))
