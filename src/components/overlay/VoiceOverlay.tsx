import { motion } from 'framer-motion'
import { useEffect, useCallback, useRef, useState, useMemo } from 'react'
import { AuraVisualizer } from './AuraVisualizer'
import { ResponsePanel } from './ResponsePanel'
import { ActivityPanel } from './ActivityPanel'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'
import { useTtsStore } from '../../stores/tts'
import { useSettingsStore } from '../../stores/settings'
import { useActivityStore } from '../../stores/activity'
import { useVAD } from '../../hooks/useVAD'

type OverlayStatus = 'idle' | 'listening' | 'speaking' | 'transcribing' | 'responding'

export function VoiceOverlay() {
  const { setTranscript, setListening } = useVoiceStore()
  const { status, clearResponse, setStreaming, appendResponse, isStreaming } = useGatewayStore()
  const { setView } = useUIStore()
  const { addConversation } = useConversationStore()
  const sessionKeyRef = useRef(`agent:main:${crypto.randomUUID()}`)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>('idle')
  const [transcribedText, setTranscribedText] = useState('')
  const [vadActive, setVadActive] = useState(false)

  // Sync TTS enabled state from settings
  const settingsTtsEnabled = useSettingsStore((s) => s.ttsEnabled)
  useEffect(() => {
    useTtsStore.getState().setEnabled(settingsTtsEnabled)
  }, [settingsTtsEnabled])

  // TTS store
  const isTtsSpeaking = useTtsStore((s) => s.isSpeaking)
  const ttsStop = useTtsStore((s) => s.stop)

  // Activity tracking
  const activity = useActivityStore

  // Track the last sent message for conversation history
  const lastSentMessageRef = useRef('')

  // Send message to gateway (ClawX-compatible protocol)
  const sendMessage = useCallback(async (message?: string) => {
    const msg = (message || textInput).trim()
    if (!msg) return
    if (status !== 'connected') return

    clearResponse()
    setStreaming(true)
    setOverlayStatus('responding')
    setTextInput('')
    lastSentMessageRef.current = msg

    if (!activity.getState().currentEntryId) {
      activity.getState().startActivity()
      activity.getState().setUserInput(msg)
    }
    activity.getState().addStep('sending')

    await window.voiceClaw.gateway.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: msg,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    })

    activity.getState().completeStep('sending')
    activity.getState().addStep('responding')
  }, [textInput, status, clearResponse, setStreaming])

  // Transcribe audio blob and send to gateway
  const transcribeAndSend = useCallback(async (audioBlob: Blob) => {
    setOverlayStatus('transcribing')
    const sizeKB = (audioBlob.size / 1024).toFixed(0)
    activity.getState().addStep('transcribing', `${sizeKB}KB`)

    try {
      const arrayBuffer = await audioBlob.arrayBuffer()
      const text = await window.voiceClaw.audio.transcribe(arrayBuffer)
      activity.getState().completeStep('transcribing')

      if (text && text.trim()) {
        setTranscribedText(text.trim())
        setTranscript(text.trim())
        activity.getState().setTranscribedText(text.trim())
        await sendMessage(text.trim())
      } else {
        setOverlayStatus(vadActive ? 'listening' : 'idle')
        activity.getState().failActivity('No speech detected')
      }
    } catch (err) {
      console.error('Transcription error:', err)
      setOverlayStatus(vadActive ? 'listening' : 'idle')
      activity.getState().failActivity(
        `Transcription failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
  }, [sendMessage, setTranscript, vadActive])

  // VAD callbacks (memoized to avoid re-creating VAD)
  const vadOptions = useMemo(() => ({
    onSpeechStart: () => {
      // Stop TTS if speaking
      useTtsStore.getState().stop()
      setOverlayStatus('speaking')
      setListening(true)
      useActivityStore.getState().startActivity()
      useActivityStore.getState().addStep('recording')
    },
    onSpeechEnd: (audioBlob: Blob, durationMs: number) => {
      setListening(false)
      useActivityStore.getState().completeStep('recording')

      if (durationMs < 200) {
        // Too short, ignore
        setOverlayStatus('listening')
        useActivityStore.getState().failActivity('Too short')
        return
      }

      // Auto-transcribe and send
      transcribeAndSend(audioBlob)
    },
    onVADMisfire: () => {
      setOverlayStatus('listening')
    },
  }), [setListening, transcribeAndSend])

  // VAD hook
  const { isListening: vadListening, isSpeaking: vadSpeaking, start: startVAD, stop: stopVAD } = useVAD(vadOptions)

  // Toggle VAD mode (auto-conversation)
  const toggleVAD = useCallback(async () => {
    if (vadActive) {
      stopVAD()
      setVadActive(false)
      setOverlayStatus('idle')
      setListening(false)
    } else {
      ttsStop()
      setVadActive(true)
      setOverlayStatus('listening')
      await startVAD()
    }
  }, [vadActive, startVAD, stopVAD, ttsStop, setListening])

  // Listen for gateway events (ClawX agent streaming protocol)
  useEffect(() => {
    const unsubEvent = window.voiceClaw.gateway.onEvent((data: any) => {
      if (data.event === 'agent') {
        const payload = data.payload
        const stream = payload?.stream
        const eventData = payload?.data

        if (stream === 'assistant') {
          if (eventData?.delta) {
            appendResponse(eventData.delta)
          }
        }

        if (stream === 'lifecycle') {
          const phase = eventData?.phase

          if (phase === 'start') {
            clearResponse()
            setStreaming(true)
            setOverlayStatus('responding')
          }

          if (phase === 'end' || phase === 'done') {
            setStreaming(false)
            setTranscribedText('')
            const response = useGatewayStore.getState().streamingResponse
            addConversation({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              transcript: lastSentMessageRef.current,
              response,
            })
            const act = useActivityStore.getState()
            act.completeStep('responding')
            act.setAiResponse(response)

            // Speak AI response via TTS
            const tts = useTtsStore.getState()
            if (tts.enabled && response) {
              act.addStep('tts')
              tts.speakDirect(response).then(() => {
                act.completeStep('tts')
                act.addStep('done')
                act.completeStep('done')
                act.completeActivity()
                // Return to listening if VAD is active
                setOverlayStatus(
                  useActivityStore.getState().currentEntryId ? 'responding' : 'listening'
                )
              }).catch(() => {
                act.addStep('done')
                act.completeStep('done')
                act.completeActivity()
                setOverlayStatus('listening')
              })
            } else {
              act.addStep('done')
              act.completeStep('done')
              act.completeActivity()
              // Return to listening state if VAD is active
              setOverlayStatus(vadActive ? 'listening' : 'idle')
            }
          }

          if (phase === 'error') {
            setStreaming(false)
            setOverlayStatus(vadActive ? 'listening' : 'idle')
            useActivityStore.getState().failActivity('AI response error')
          }
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
  }, [appendResponse, setStreaming, addConversation, clearResponse, vadActive])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVAD()
    }
  }, [stopVAD])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (vadActive) {
          stopVAD()
          setVadActive(false)
          setOverlayStatus('idle')
          setListening(false)
        } else {
          window.voiceClaw.overlay.hide()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [vadActive, stopVAD, setListening])

  // Status text
  const statusText = (() => {
    switch (overlayStatus) {
      case 'listening':
        return 'Listening... (auto)'
      case 'speaking':
        return 'Detecting speech...'
      case 'transcribing':
        return 'Transcribing...'
      case 'responding':
        return 'AI responding...'
      default:
        return 'Click to start'
    }
  })()

  // Determine volume for Aura orb
  const auraVolume = vadSpeaking
    ? 0.8
    : vadListening
    ? 0.15
    : isTtsSpeaking
    ? 0.6
    : isStreaming
    ? 0.5
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-full h-full flex flex-col"
    >
      {/* Header */}
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
          {vadActive && (
            <span className="text-[10px] text-claw-accent font-medium ml-1">AUTO</span>
          )}
        </div>

        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setView('skills')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-1.5 py-1"
          >
            Skills
          </button>
          <button
            onClick={() => setView('cron')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-1.5 py-1"
          >
            Cron
          </button>
          <button
            onClick={() => setView('history')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-1.5 py-1"
          >
            History
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors px-1.5 py-1"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4 pb-2">
        {/* Aura Orb */}
        <button
          onClick={toggleVAD}
          disabled={status !== 'connected'}
          className="relative w-28 h-28 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed group focus:outline-none"
          aria-label={vadActive ? 'Stop auto-conversation' : 'Start auto-conversation'}
        >
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <AuraVisualizer volume={auraVolume} className="w-full h-full" />
          </div>
          {/* Speaking indicator */}
          {vadSpeaking && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-400/60"
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
          {/* Listening pulse */}
          {vadListening && !vadSpeaking && overlayStatus === 'listening' && (
            <motion.div
              className="absolute inset-0 rounded-full border border-claw-accent/30"
              animate={{ scale: [1, 1.04, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
          <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-claw-surface/60 border border-claw-border/50 group-hover:bg-claw-surface/80 transition-colors">
            {vadActive ? (
              vadSpeaking ? (
                /* Waveform icon when speaking */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
                  <path d="M2 12h2m4-6v12m4-8v4m4-10v16m4-12v8" strokeLinecap="round" />
                </svg>
              ) : (
                /* Active mic icon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={
                    overlayStatus === 'responding' ? 'text-claw-accent'
                    : overlayStatus === 'transcribing' ? 'text-claw-warning'
                    : 'text-claw-success'
                  }
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )
            ) : (
              /* Idle mic icon */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="text-claw-text-dim group-hover:text-claw-text transition-colors"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            )}
          </div>
        </button>

        {/* Status text */}
        <span className={`text-xs font-medium ${
          vadSpeaking
            ? 'text-emerald-400'
            : overlayStatus === 'listening'
            ? 'text-claw-success'
            : overlayStatus === 'transcribing'
            ? 'text-claw-warning'
            : overlayStatus === 'responding'
            ? 'text-claw-accent'
            : 'text-claw-text-dim'
        }`}>
          {statusText}
        </span>

        {/* Transcribed text */}
        {transcribedText && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-claw-text-dim italic max-w-lg text-center truncate"
          >
            &ldquo;{transcribedText}&rdquo;
          </motion.div>
        )}

        {/* Text input fallback */}
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
            disabled={status !== 'connected' || vadActive}
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
        <ActivityPanel />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 text-center">
        <span className="text-[10px] text-claw-text-dim">
          {vadActive ? (
            <>
              <kbd className="px-1 py-0.5 bg-claw-surface rounded text-[10px]">Esc</kbd> to stop
              {' · '}
              Auto-detecting speech via Silero VAD
            </>
          ) : (
            <>
              Click orb to start
              {' · '}
              <kbd className="px-1 py-0.5 bg-claw-surface rounded text-[10px]">Enter</kbd> to send
              {' · '}
              <kbd className="px-1 py-0.5 bg-claw-surface rounded text-[10px]">Esc</kbd> to close
            </>
          )}
        </span>
      </div>
    </motion.div>
  )
}
