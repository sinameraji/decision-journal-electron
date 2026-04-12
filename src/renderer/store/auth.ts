import { create } from 'zustand'
import type { VaultStatus } from '@shared/ipc-contract'

interface AuthState {
  status: VaultStatus | null
  unlocked: boolean
  loading: boolean
  refreshStatus: () => Promise<void>
  markUnlocked: () => void
  lock: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: null,
  unlocked: false,
  loading: true,

  refreshStatus: async () => {
    const status = await window.api.vault.status()
    set({ status, loading: false })
  },

  markUnlocked: () => set({ unlocked: true }),

  lock: async () => {
    await window.api.vault.lock()
    set({ unlocked: false })
  }
}))
