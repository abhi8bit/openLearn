import { create } from 'zustand'
import type { UIStore } from '@/types'

export const useUIStore = create<UIStore>((set) => ({
  isRightPanelOpen: false,
  isMockSettingsOpen: false,

  toggleRightPanel: () => set((s) => ({ isRightPanelOpen: !s.isRightPanelOpen })),
  setRightPanel: (open) => set({ isRightPanelOpen: open }),
  setMockSettingsOpen: (open) => set({ isMockSettingsOpen: open }),
}))
