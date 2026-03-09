import { motion, AnimatePresence } from 'framer-motion'
import { useVoiceStore } from '../../stores/voice'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import { useAudioVisualizer } from '../../hooks/useAudioVisualizer'
import { WaveformVisualizer } from './WaveformVisualizer'
import { useEffect } from 'react'

export function VoiceInput() {
  const { isListening, error } = useVoiceStore()
  const { toggleListening } = useSpeechRecognition()
  const { audioData, volume, start, stop } = useAudioVisualizer()

  useEffect(() => {
    if (isListening) {
      start()
    } else {
      stop()
    }
  }, [isListening, start, stop])

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mic Button */}
      <div className="relative">
        {/* Pulse rings */}
        <AnimatePresence>
          {isListening && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full bg-claw-accent/20"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-0 rounded-full bg-claw-accent/15"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
              />
            </>
          )}
        </AnimatePresence>

        <motion.button
          onClick={toggleListening}
          className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isListening
              ? 'bg-claw-accent shadow-lg shadow-claw-accent/30'
              : 'bg-claw-surface border border-claw-border hover:bg-claw-accent/20'
          }`}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
        >
          {/* Mic icon */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isListening ? 'text-white' : 'text-claw-text'}
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>

          {/* Volume indicator ring */}
          {isListening && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-claw-accent-light"
              animate={{
                scale: 1 + volume * 0.3,
                opacity: 0.5 + volume * 0.5,
              }}
              transition={{ duration: 0.1 }}
            />
          )}
        </motion.button>
      </div>

      {/* Waveform */}
      <WaveformVisualizer audioData={audioData} isActive={isListening} />

      {/* Status text */}
      <motion.p
        className="text-xs text-claw-text-dim"
        animate={{ opacity: isListening ? 1 : 0.6 }}
      >
        {isListening ? 'Listening...' : 'Click to start'}
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
