import { motion } from 'framer-motion'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useAudioVisualizer } from '../../hooks/useAudioVisualizer'
import { AuraVisualizer } from './AuraVisualizer'
import { useEffect } from 'react'

export function VoiceInput() {
  const { isListening, error } = useVoiceStore()
  const { isStreaming } = useGatewayStore()
  const { toggleListening } = useSpeechRecognition()
  const { volume, start, stop } = useAudioVisualizer()

  useEffect(() => {
    if (isListening) {
      start()
    } else {
      stop()
    }
  }, [isListening, start, stop])

  const statusText = isStreaming
    ? 'AI is responding...'
    : isListening
    ? 'Listening...'
    : 'Click the orb to start'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Aura Orb - clickable */}
      <motion.button
        onClick={toggleListening}
        className="relative w-44 h-44 flex items-center justify-center cursor-pointer focus:outline-none"
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.03 }}
      >
        {/* Aura WebGL Shader */}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <AuraVisualizer volume={volume} className="w-full h-full" />
        </div>

        {/* Center mic icon */}
        <div
          className={`relative z-10 w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-all ${
            isListening
              ? 'bg-white/10 shadow-lg shadow-claw-accent/20'
              : 'bg-claw-surface/60 border border-claw-border/50'
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isListening ? 'text-white' : 'text-claw-text-dim'}
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
      </motion.button>

      {/* Status text */}
      <motion.p
        className="text-xs text-claw-text-dim"
        animate={{ opacity: isListening || isStreaming ? 1 : 0.6 }}
      >
        {statusText}
      </motion.p>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-claw-error"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}
