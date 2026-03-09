import { motion } from 'framer-motion'
import { useEffect, useCallback, useRef, useState } from 'react'
import { VoiceInput } from './VoiceInput'
import { Transcription } from './Transcription'
import { ResponsePanel } from './ResponsePanel'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'

export function VoiceOverlay() {
  const { transcript, isListening, error, setTranscript } = useVoiceStore()
  const { status, clearResponse, setStreaming, appendResponse } = useGatewayStore()
  const { setView } = useUIStore()
  const { addConversation } = useConversationStore()
  const sessionKeyRef = useRef(`agent:main:${crypto.randomUUID()}`)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)

  // Show text input when speech recognition fails
  const speechUnavailable = !!error

  // Send message to gateway (ClawX-compatible protocol)
  const sendMessage = useCallback(async (message?: string) => {
    const msg = (message || transcript).trim()
    if (!msg) return
    if (status !== 'connected') return

    clearResponse()
    setStreaming(true)

    // Clear inputs
    if (message) {
      setTextInput('')
    } else {
      setTranscript('')
    }

    await window.voiceClaw.gateway.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: msg,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    })
  }, [transcript, status, clearResponse, setStreaming, setTranscript])

  // Listen for gateway events (ClawX agent streaming protocol)
  useEffect(() => {
    const unsubEvent = window.voiceClaw.gateway.onEvent((data: any) => {
      if (data.event === 'agent') {
        const payload = data.payload
        const phase = payload?.phase || payload?.state

        if (phase === 'streaming' || phase === 'delta') {
          // Extract streaming text
          const msg = payload?.message || payload?.data
          if (msg?.content) {
            const text = typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
              ? msg.content.map((b: any) => b.text || '').join('')
              : ''
            if (text) appendResponse(text)
          }
        }

        if (phase === 'final' || phase === 'completed') {
          setStreaming(false)
          addConversation({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            transcript: transcript.trim(),
            response: useGatewayStore.getState().streamingResponse,
          })
        }

        if (phase === 'error') {
          setStreaming(false)
        }
      }
    })

    // Also listen for direct RPC responses (fallback)
    const unsubMessage = window.voiceClaw.gateway.onMessage((message: any) => {
      if (message?.result?.chunk) {
        appendResponse(message.result.chunk)
      }
      if (message?.result?.done || message?.ok === true) {
        // RPC response completed
      }
    })

    return () => {
      unsubEvent()
      unsubMessage()
    }
  }, [appendResponse, setStreaming, addConversation, transcript])

  // Keyboard shortcuts within overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.voiceClaw.overlay.hide()
      }
      // Enter to send (only when not in text input - text input handles its own Enter)
      if (e.key === 'Enter' && !e.shiftKey && transcript.trim() && !isListening && !speechUnavailable) {
        sendMessage()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [transcript, isListening, sendMessage, speechUnavailable])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-full h-full flex flex-col"
    >
      {/* Header - draggable region */}
      <div className="flex items-center justify-between px-4 py-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
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

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 pb-4">
        {!speechUnavailable && (
          <>
            <VoiceInput />
            <Transcription />

            {/* Send button */}
            {transcript.trim() && !isListening && (
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => sendMessage()}
                className="px-6 py-2 bg-claw-accent hover:bg-claw-accent/80 text-white text-sm rounded-lg transition-colors"
              >
                Send to OpenClaw
              </motion.button>
            )}
          </>
        )}

        {/* Text input fallback when speech recognition is unavailable */}
        {speechUnavailable && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md flex flex-col items-center gap-3"
          >
            <p className="text-xs text-claw-text-dim text-center">
              Voice input unavailable in Electron. Type your message:
            </p>
            <div className="w-full flex gap-2">
              <input
                ref={textInputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textInput.trim()) {
                    sendMessage(textInput)
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 bg-claw-surface border border-claw-border rounded-lg px-3 py-2 text-sm text-claw-text placeholder-claw-text-dim focus:outline-none focus:border-claw-accent"
                autoFocus
              />
              <button
                onClick={() => sendMessage(textInput)}
                disabled={!textInput.trim() || status !== 'connected'}
                className="px-4 py-2 bg-claw-accent hover:bg-claw-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                Send
              </button>
            </div>
          </motion.div>
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
