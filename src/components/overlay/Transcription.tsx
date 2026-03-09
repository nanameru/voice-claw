import { motion, AnimatePresence } from 'framer-motion'
import { useVoiceStore } from '../../stores/voice'

export function Transcription() {
  const { transcript, interimTranscript, isListening } = useVoiceStore()

  const hasContent = transcript || interimTranscript

  return (
    <AnimatePresence>
      {hasContent && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="w-full px-4"
        >
          <div className="bg-claw-surface/80 rounded-lg p-3 border border-claw-border max-h-24 overflow-y-auto">
            <p className="text-sm text-claw-text leading-relaxed">
              {transcript}
              {interimTranscript && (
                <span className="text-claw-text-dim">{interimTranscript}</span>
              )}
              {isListening && (
                <motion.span
                  className="inline-block w-0.5 h-4 bg-claw-accent ml-0.5 align-middle"
                  animate={{ opacity: [1, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
