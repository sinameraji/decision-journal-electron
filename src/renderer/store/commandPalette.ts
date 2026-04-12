import { create } from 'zustand'

interface CommandPaletteState {
  open: boolean
  openPalette: () => void
  closePalette: () => void
  toggle: () => void
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open }))
}))
