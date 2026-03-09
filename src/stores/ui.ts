import { create } from 'zustand'

type View = 'overlay' | 'settings' | 'history' | 'onboarding'

interface UIState {
  view: View
  isVisible: boolean
  isAnimating: boolean

  setView: (view: View) => void
  setVisible: (visible: boolean) => void
  setAnimating: (animating: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  view: 'overlay',
  isVisible: false,
  isAnimating: false,

  setView: (view) => set({ view }),
  setVisible: (visible) => set({ isVisible: visible }),
  setAnimating: (animating) => set({ isAnimating: animating }),
}))
