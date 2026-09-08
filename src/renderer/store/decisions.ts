import { create } from 'zustand'
import type { Decision } from '@shared/ipc-contract'

interface DecisionsState {
  query: string
  results: Decision[]
  loading: boolean
  /**
   * Set when the journal could not be read. Without this, a failing query left
   * `results` empty and the UI rendered "no decisions yet" — a database error
   * looking exactly like an empty journal, which for this app is the most
   * alarming failure possible.
   */
  error: string | null
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
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null })
    try {
      set({ results: await window.api.decisions.list(), loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not read your journal.'
      })
    }
  },

  setQuery: (q: string) => {
    set({ query: q })
    const token = ++searchToken
    setTimeout(async () => {
      if (token !== searchToken) return
      try {
        const results = await runQuery(q)
        if (token !== searchToken) return
        set({ results, error: null })
      } catch (err) {
        if (token !== searchToken) return
        set({ error: err instanceof Error ? err.message : 'Could not read your journal.' })
      }
    }, 120)
  },

  refresh: async () => {
    const token = ++searchToken
    try {
      const results = await runQuery(get().query)
      if (token !== searchToken) return
      set({ results, error: null })
    } catch (err) {
      if (token !== searchToken) return
      set({ error: err instanceof Error ? err.message : 'Could not read your journal.' })
    }
  }
}))
