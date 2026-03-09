import { motion } from 'framer-motion'
import { useEffect, useCallback, useRef, useState } from 'react'
import { AuraVisualizer } from './AuraVisualizer'
import { ResponsePanel } from './ResponsePanel'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'

export function VoiceOverlay() {
  const { transcript, setTranscript } = useVoiceStore()
  const { status, clearResponse, setStreaming, appendResponse, isStreaming } = useGatewayStore()
  const { setView } = useUIStore()
  const { addConversation } = useConversationStore()
  const sessionKeyRef = useRef(`agent:main:${crypto.randomUUID()}`)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)

  // Send message to gateway (ClawX-compatible protocol)
  const sendMessage = useCallback(async (message?: string) => {
    const msg = (message || textInput).trim()
    if (!msg) return
    if (status !== 'connected') return

    clearResponse()
    setStreaming(true)
    setTextInput('')

    await window.voiceClaw.gateway.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: msg,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    })
  }, [textInput, status, clearResponse, setStreaming])

  // Listen for gateway events (ClawX agent streaming protocol)
  useEffect(() => {
    const unsubEvent = window.voiceClaw.gateway.onEvent((data: any) => {
      if (data.event === 'agent') {
        const payload = data.payload
        const phase = payload?.phase || payload?.state

        if (phase === 'streaming' || phase === 'delta') {
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
            transcript: textInput.trim(),
            response: useGatewayStore.getState().streamingResponse,
          })
        }

        if (phase === 'error') {
          setStreaming(false)
        }
      }
    })

    const unsubMessage = window.voiceClaw.gateway.onMessage((message: any) => {
      if (message?.result?.chunk) {
        appendResponse(message.result.chunk)
      }
    })

    return () => {
      unsubEvent()
      unsubMessage()
    }
  }, [appendResponse, setStreaming, addConversation, textInput])

  // Keyboard shortcuts within overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.voiceClaw.overlay.hide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-2">
        {/* Aura Orb - decorative visual */}
        <div className="relative w-28 h-28 flex items-center justify-center">
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <AuraVisualizer volume={isStreaming ? 0.5 : 0} className="w-full h-full" />
          </div>
          <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-claw-surface/60 border border-claw-border/50">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={isStreaming ? 'text-claw-accent' : 'text-claw-text-dim'}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </div>
        </div>

        {/* Text input - always visible */}
        <div className="w-full max-w-lg flex gap-2">
          <input
            ref={textInputRef}
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && textInput.trim() && status === 'connected') {
                sendMessage(textInput)
              }
            }}
            placeholder={status === 'connected' ? 'Type a message...' : 'Waiting for Gateway...'}
            disabled={status !== 'connected'}
            className="flex-1 bg-claw-surface border border-claw-border rounded-lg px-4 py-2.5 text-sm text-claw-text placeholder-claw-text-dim focus:outline-none focus:border-claw-accent disabled:opacity-40 transition-colors"
            autoFocus
          />
          <button
            onClick={() => sendMessage(textInput)}
            disabled={!textInput.trim() || status !== 'connected' || isStreaming}
            className="px-5 py-2.5 bg-claw-accent hover:bg-claw-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </div>

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
