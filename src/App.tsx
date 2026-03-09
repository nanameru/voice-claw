import { useEffect, Component, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VoiceOverlay } from './components/overlay/VoiceOverlay'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { OnboardingFlow } from './components/onboarding/OnboardingFlow'
import { HistoryPanel } from './components/history/HistoryPanel'
import { useUIStore } from './stores/ui'
import { useSettingsStore } from './stores/settings'
import { useGatewayStore } from './stores/gateway'

// Error boundary to catch React render errors
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 20,
          color: '#ff6b6b',
          background: '#0a0a0f',
          fontFamily: 'monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          height: '100%',
          overflow: 'auto',
        }}>
          <h2 style={{ color: '#feca57' }}>React Error</h2>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function AppContent() {
  const { view, setView, setVisible } = useUIStore()
  const { loadSettings } = useSettingsStore()
  const { setStatus } = useGatewayStore()

  useEffect(() => {
    loadSettings().then(() => {
      if (!useSettingsStore.getState().onboarded) {
        setView('onboarding')
      }
    }).catch((err) => {
      console.error('Failed to load settings:', err)
    })

    const unsubShow = window.voiceClaw.overlay.onShow(() => setVisible(true))
    const unsubHide = window.voiceClaw.overlay.onHide(() => setVisible(false))

    const unsubStatus = window.voiceClaw.gateway.onStatusChange((status) => {
      setStatus(status as 'connected' | 'connecting' | 'disconnected')
    })

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

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}
