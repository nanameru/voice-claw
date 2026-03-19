import { create } from 'zustand'

type View = 'overlay' | 'settings' | 'history' | 'onboarding' | 'skills' | 'cron'

export interface ScreenSnapshot {
  base64: string
  cursor: { x: number; y: number }
  timestamp: number
}

interface UIState {
  view: View
  isVisible: boolean
  isAnimating: boolean
  isPTTActive: boolean
  snapshots: ScreenSnapshot[]

  setView: (view: View) => void
  setVisible: (visible: boolean) => void
  setAnimating: (animating: boolean) => void
  setPTTActive: (active: boolean) => void
  setSnapshots: (snapshots: ScreenSnapshot[]) => void
  clearSnapshots: () => void
}

export const useUIStore = create<UIState>((set) => ({
  view: 'overlay',
  isVisible: false,
  isAnimating: false,
  isPTTActive: false,
  snapshots: [],

  setView: (view) => set({ view }),
  setVisible: (visible) => set({ isVisible: visible }),
  setAnimating: (animating) => set({ isAnimating: animating }),
  setPTTActive: (active) => set({ isPTTActive: active }),
  setSnapshots: (snapshots) => set({ snapshots }),
  clearSnapshots: () => set({ snapshots: [] }),
}))
