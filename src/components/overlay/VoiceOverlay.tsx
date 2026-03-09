import { motion } from 'framer-motion'
import { useEffect, useCallback } from 'react'
import { VoiceInput } from './VoiceInput'
import { Transcription } from './Transcription'
import { ResponsePanel } from './ResponsePanel'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'

export function VoiceOverlay() {
  const { transcript, isListening, clearTranscript } = useVoiceStore()
  const { status, streamingResponse, clearResponse, setStreaming, appendResponse } = useGatewayStore()
  const { setView } = useUIStore()
  const { addConversation } = useConversationStore()
  const { stopListening } = useSpeechRecognition()

  // Send transcript to gateway when user stops speaking
  const sendTranscript = useCallback(async () => {
    if (!transcript.trim()) return
    if (status !== 'connected') return

    clearResponse()
    setStreaming(true)

    await window.voiceClaw.gateway.send('chat', {
      message: transcript.trim(),
    })
  }, [transcript, status, clearResponse, setStreaming])

  // Listen for gateway messages
  useEffect(() => {
    const unsubMessage = window.voiceClaw.gateway.onMessage((message: any) => {
      if (message?.result?.chunk) {
        appendResponse(message.result.chunk)
      }
      if (message?.result?.done) {
        setStreaming(false)
        // Save conversation
        addConversation({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          transcript: transcript.trim(),
          response: useGatewayStore.getState().streamingResponse,
        })
      }
    })

    return unsubMessage
  }, [appendResponse, setStreaming, addConversation, transcript])

  // Keyboard shortcuts within overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.voiceClaw.overlay.hide()
      }
      if (e.key === 'Enter' && !e.shiftKey && transcript.trim() && !isListening) {
        sendTranscript()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [transcript, isListening, sendTranscript])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-full h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-claw-success'
                : status === 'connecting'
                ? 'bg-claw-warning animate-pulse'
                : 'bg-claw-error'
            }`}
          />
          <span className="text-xs text-claw-text-dim">
            {status === 'connected' ? 'Gateway Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('history')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-2 py-1"
          >
            History
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-2 py-1"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-4">
        <VoiceInput />
        <Transcription />

        {/* Send button */}
        {transcript.trim() && !isListening && (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => {
              sendTranscript()
            }}
            className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white text-sm rounded-lg transition-colors"
          >
            Send to OpenClaw
          </motion.button>
        )}

        <ResponsePanel />
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 text-center">
        <span className="text-[10px] text-claw-text-dim">
          Press <kbd className="px-1 py-0.5 bg-claw-surface rounded text-[10px]">Esc</kbd> to close
          {' · '}
          <kbd className="px-1 py-0.5 bg-claw-surface rounded text-[10px]">Enter</kbd> to send
        </span>
      </div>
    </motion.div>
  )
}
