import { create } from 'zustand'
import type { RoleModel, RoleModelSettings } from '@shared/roleModels'

interface RoleModelsState {
  settings: RoleModelSettings | null
  models: RoleModel[]
  loading: boolean
  initialized: boolean

  init: () => Promise<void>
  refresh: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  add: (query: string) => Promise<string | null>
  confirm: (id: string, name: string) => Promise<string | null>
  reject: (id: string, hint: string) => Promise<string | null>
  rebuild: (id: string) => Promise<void>
  /** Restarts a failed lookup from wherever it got to. */
  retry: (id: string) => Promise<void>
  addSource: (id: string, url: string) => Promise<string | null>
  remove: (id: string) => Promise<void>
  setFrameworkEnabled: (frameworkId: string, enabled: boolean) => Promise<void>
  reset: () => void
}

let disposer: (() => void) | null = null

export const useRoleModelsStore = create<RoleModelsState>((set, get) => ({
  settings: null,
  models: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (!get().initialized) {
      disposer?.()
      // Lookups run in the main process, so the UI is told when they progress.
      disposer = window.api.roleModels.onChanged(() => void get().refresh())
      set({ initialized: true })
    }
    await get().refresh()
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const [settings, models] = await Promise.all([
        window.api.roleModels.getSettings(),
        window.api.roleModels.list()
      ])
      set({ settings, models, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setEnabled: async (enabled) => {
    set({ settings: await window.api.roleModels.setEnabled(enabled) })
    await get().refresh()
  },

  add: async (query) => {
    const res = await window.api.roleModels.add(query)
    await get().refresh()
    return res.ok ? null : res.error
  },

  confirm: async (id, name) => {
    const res = await window.api.roleModels.confirm(id, name)
    await get().refresh()
    return res.ok ? null : res.error
  },

  reject: async (id, hint) => {
    const res = await window.api.roleModels.reject(id, hint)
    await get().refresh()
    return res.ok ? null : res.error
  },

  rebuild: async (id) => {
    await window.api.roleModels.rebuild(id)
    await get().refresh()
  },

  retry: async (id) => {
    await window.api.roleModels.retry(id)
    await get().refresh()
  },

  addSource: async (id, url) => {
    const res = await window.api.roleModels.addSource(id, url)
    await get().refresh()
    return res.ok ? null : res.error
  },

  remove: async (id) => {
    await window.api.roleModels.remove(id)
    await get().refresh()
  },

  setFrameworkEnabled: async (frameworkId, enabled) => {
    await window.api.roleModels.setFrameworkEnabled(frameworkId, enabled)
    await get().refresh()
  },

  reset: () => {
    disposer?.()
    disposer = null
    set({ settings: null, models: [], loading: false, initialized: false })
  }
}))
