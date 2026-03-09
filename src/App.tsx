import { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VoiceOverlay } from './components/overlay/VoiceOverlay'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { HistoryPanel } from './components/history/HistoryPanel'
import { useUIStore } from './stores/ui'
import { useSettingsStore } from './stores/settings'
import { useGatewayStore } from './stores/gateway'

export default function App() {
  const { view, setView, setVisible } = useUIStore()
  const { loadSettings, onboarded } = useSettingsStore()
  const { setStatus } = useGatewayStore()

  useEffect(() => {
    // Load settings on mount
    loadSettings().then(() => {
      if (!useSettingsStore.getState().onboarded) {
        setView('onboarding')
      }
    })

    // Listen for overlay show/hide
    const unsubShow = window.voiceClaw.overlay.onShow(() => setVisible(true))
    const unsubHide = window.voiceClaw.overlay.onHide(() => setVisible(false))

    // Listen for gateway status
    const unsubStatus = window.voiceClaw.gateway.onStatusChange((status) => {
      setStatus(status as 'connected' | 'connecting' | 'disconnected')
    })

    // Get initial gateway status
    window.voiceClaw.gateway.getStatus().then((status) => setStatus(status))

    return () => {
      unsubShow()
      unsubHide()
      unsubStatus()
    }
  }, [loadSettings, setView, setVisible, setStatus])

  return (
    <div className="w-full h-full bg-claw-bg/95 backdrop-blur-xl rounded-2xl border border-claw-border/50 overflow-hidden shadow-2xl shadow-black/50">
      <AnimatePresence mode="wait">
        {view === 'onboarding' && <OnboardingFlow key="onboarding" />}
        {view === 'overlay' && <VoiceOverlay key="overlay" />}
        {view === 'settings' && <SettingsPanel key="settings" />}
        {view === 'history' && <HistoryPanel key="history" />}
      </AnimatePresence>
    </div>
  )
}
