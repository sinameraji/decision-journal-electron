import { create } from 'zustand'
import type { MemoryItem, MemoryJob, MemorySettings } from '@shared/memory'

interface MemoryState {
  settings: MemorySettings | null
  items: MemoryItem[]
  jobs: MemoryJob[]
  loading: boolean
  initialized: boolean

  init: () => Promise<void>
  refresh: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  approve: (id: string) => Promise<void>
  reject: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  updateStatement: (id: string, statement: string) => Promise<string | null>
  answer: (id: string, text: string) => Promise<string | null>
  forgetAll: () => Promise<void>
  reset: () => void
}

let disposer: (() => void) | null = null

export const useMemoryStore = create<MemoryState>((set, get) => ({
  settings: null,
  items: [],
  jobs: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (!get().initialized) {
      disposer?.()
      // The extraction queue runs in the main process, so the UI is told when
      // proposals land rather than polling for them.
      disposer = window.api.memory.onChanged(() => {
        void get().refresh()
      })
      set({ initialized: true })
    }
    await get().refresh()
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const [settings, items, jobs] = await Promise.all([
        window.api.memory.getSettings(),
        window.api.memory.list(),
        window.api.memory.jobs()
      ])
      set({ settings, items, jobs, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setEnabled: async (enabled) => {
    const settings = await window.api.memory.setEnabled(enabled)
    set({ settings })
    await get().refresh()
  },

  approve: async (id) => {
    await window.api.memory.approve(id)
    await get().refresh()
  },

  reject: async (id) => {
    await window.api.memory.reject(id)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.memory.delete(id)
    await get().refresh()
  },

  updateStatement: async (id, statement) => {
    const res = await window.api.memory.updateStatement(id, statement)
    await get().refresh()
    return res.ok ? null : res.error
  },

  answer: async (id, text) => {
    const res = await window.api.memory.answer(id, text)
    await get().refresh()
    return res.ok ? null : res.error
  },

  forgetAll: async () => {
    await window.api.memory.forgetAll()
    await get().refresh()
  },

  reset: () => {
    disposer?.()
    disposer = null
    set({ settings: null, items: [], jobs: [], loading: false, initialized: false })
  }
}))
