import { create } from 'zustand'

type View = 'overlay' | 'settings' | 'history' | 'onboarding' | 'skills' | 'cron'

interface UIState {
  view: View
  isVisible: boolean
  isAnimating: boolean
  isPTTActive: boolean
  screenshotBase64: string | null

  setView: (view: View) => void
  setVisible: (visible: boolean) => void
  setAnimating: (animating: boolean) => void
  setPTTActive: (active: boolean) => void
  setScreenshot: (base64: string | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  view: 'overlay',
  isVisible: false,
  isAnimating: false,
  isPTTActive: false,
  screenshotBase64: null,

  setView: (view) => set({ view }),
  setVisible: (visible) => set({ isVisible: visible }),
  setAnimating: (animating) => set({ isAnimating: animating }),
  setPTTActive: (active) => set({ isPTTActive: active }),
  setScreenshot: (base64) => set({ screenshotBase64: base64 }),
}))
