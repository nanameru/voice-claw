import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { useUIStore } from '../../stores/ui'

type Step = 'welcome' | 'gateway' | 'microphone' | 'shortcut' | 'done'

export function OnboardingFlow() {
  const [step, setStep] = useState<Step>('welcome')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('18789')
  const [micGranted, setMicGranted] = useState(false)
  const settings = useSettingsStore()
  const { setView } = useUIStore()

  const handleRequestMic = async () => {
    const granted = await window.voiceClaw.mic.requestPermission()
    setMicGranted(granted)
    if (granted) setStep('shortcut')
  }

  const handleComplete = async () => {
    await settings.updateGateway(host, parseInt(port, 10))
    await settings.setOnboarded(true)
    window.voiceClaw.gateway.connect()
    setView('overlay')
  }

  const inputClass =
    'w-full bg-claw-bg border border-claw-border rounded-md px-3 py-2 text-sm text-claw-text focus:outline-none focus:border-claw-accent'

  const stepVariants = {
    enter: { opacity: 0, x: 30 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="text-center space-y-6"
          >
            <div className="text-4xl">🎙️</div>
            <h1 className="text-2xl font-bold text-claw-text">Welcome to VoiceClaw</h1>
            <p className="text-sm text-claw-text-dim max-w-sm">
              Voice-activated AI assistant. Speak naturally, get instant responses from OpenClaw.
            </p>
            <button
              onClick={() => setStep('gateway')}
              className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white rounded-lg text-sm transition-colors"
            >
              Get Started
            </button>
          </motion.div>
        )}

        {step === 'gateway' && (
          <motion.div
            key="gateway"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="space-y-4 w-full max-w-sm"
          >
            <h2 className="text-lg font-semibold text-claw-text">Gateway Connection</h2>
            <p className="text-xs text-claw-text-dim">
              Connect to your OpenClaw Gateway instance.
            </p>
            <div className="space-y-2">
              <input
                className={inputClass}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="Host"
              />
              <input
                className={inputClass}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Port"
              />
            </div>
            <button
              onClick={() => setStep('microphone')}
              className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white rounded-lg text-sm transition-colors"
            >
              Next
            </button>
          </motion.div>
        )}

        {step === 'microphone' && (
          <motion.div
            key="microphone"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="text-center space-y-4"
          >
            <div className="text-4xl">🎤</div>
            <h2 className="text-lg font-semibold text-claw-text">Microphone Access</h2>
            <p className="text-xs text-claw-text-dim max-w-sm">
              VoiceClaw needs microphone access for voice input.
            </p>
            {micGranted ? (
              <div className="text-claw-success text-sm">Microphone access granted!</div>
            ) : (
              <button
                onClick={handleRequestMic}
                className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white rounded-lg text-sm transition-colors"
              >
                Grant Permission
              </button>
            )}
            <div>
              <button
                onClick={() => setStep('shortcut')}
                className="text-xs text-claw-text-dim hover:text-claw-text transition-colors"
              >
                Skip
              </button>
            </div>
          </motion.div>
        )}

        {step === 'shortcut' && (
          <motion.div
            key="shortcut"
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="text-center space-y-4"
          >
            <h2 className="text-lg font-semibold text-claw-text">Global Shortcut</h2>
            <p className="text-xs text-claw-text-dim max-w-sm">
              Use <kbd className="px-2 py-0.5 bg-claw-surface rounded">Option+Space</kbd> to invoke VoiceClaw from anywhere.
            </p>
            <p className="text-xs text-claw-text-dim">You can change this later in Settings.</p>
            <button
              onClick={handleComplete}
              className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white rounded-lg text-sm transition-colors"
            >
              Complete Setup
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
