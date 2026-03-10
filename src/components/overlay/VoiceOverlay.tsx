import { motion } from 'framer-motion'
import { useEffect, useCallback, useRef, useState } from 'react'
import { AuraVisualizer } from './AuraVisualizer'
import { ResponsePanel } from './ResponsePanel'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'
import { useAudioVisualizer } from '../../hooks/useAudioVisualizer'
import { useTtsStore } from '../../stores/tts'
import { useSettingsStore } from '../../stores/settings'

type OverlayStatus = 'idle' | 'recording' | 'transcribing' | 'responding'

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

  // Sync TTS enabled state from settings
  const settingsTtsEnabled = useSettingsStore((s) => s.ttsEnabled)
  useEffect(() => {
    useTtsStore.getState().setEnabled(settingsTtsEnabled)
  }, [settingsTtsEnabled])

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Audio visualizer for live volume during recording
  const { volume, start: startVisualizer, stop: stopVisualizer } = useAudioVisualizer()

  // TTS store
  const ttsEnabled = useTtsStore((s) => s.enabled)
  const isTtsSpeaking = useTtsStore((s) => s.isSpeaking)
  const ttsSpeak = useTtsStore((s) => s.speak)
  const ttsStop = useTtsStore((s) => s.stop)

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

    await window.voiceClaw.gateway.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: msg,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
    })

    // Fire voice acknowledgment in parallel (non-blocking)
    if (ttsEnabled) {
      ttsSpeak(msg).catch((err) => console.error('TTS error:', err))
    }
  }, [textInput, status, clearResponse, setStreaming, ttsEnabled, ttsSpeak])

  // Start recording audio via MediaRecorder
  const startRecording = useCallback(async () => {
    // Stop any TTS playback before recording
    ttsStop()

    try {
      // Request mic permission if needed
      const permission = await window.voiceClaw.mic.checkPermission()
      if (permission !== 'granted') {
        await window.voiceClaw.mic.requestPermission()
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Combine chunks into a single blob
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []

        if (audioBlob.size === 0) {
          setOverlayStatus('idle')
          return
        }

        // Transcribe via Whisper
        setOverlayStatus('transcribing')
        try {
          const arrayBuffer = await audioBlob.arrayBuffer()
          const text = await window.voiceClaw.audio.transcribe(arrayBuffer)
          if (text && text.trim()) {
            setTranscribedText(text.trim())
            setTranscript(text.trim())
            // Auto-send to gateway
            await sendMessage(text.trim())
          } else {
            setOverlayStatus('idle')
          }
        } catch (err) {
          console.error('Transcription error:', err)
          setOverlayStatus('idle')
        }
      }

      mediaRecorder.start(250) // collect data every 250ms
      setOverlayStatus('recording')
      setListening(true)
      startVisualizer()
    } catch (err) {
      console.error('Recording start error:', err)
      setOverlayStatus('idle')
    }
  }, [sendMessage, setListening, setTranscript, startVisualizer, ttsStop])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setListening(false)
    stopVisualizer()
  }, [setListening, stopVisualizer])

  // Toggle recording on orb click
  const handleOrbClick = useCallback(() => {
    if (overlayStatus === 'recording') {
      stopRecording()
    } else if (overlayStatus === 'idle') {
      startRecording()
    }
    // Don't allow clicking while transcribing or responding
  }, [overlayStatus, startRecording, stopRecording])

  // Listen for gateway events (ClawX agent streaming protocol)
  useEffect(() => {
    const unsubEvent = window.voiceClaw.gateway.onEvent((data: any) => {
      if (data.event === 'agent') {
        const payload = data.payload
        const stream = payload?.stream
        const eventData = payload?.data

        // stream="assistant" => text streaming from the AI
        if (stream === 'assistant') {
          if (eventData?.delta) {
            appendResponse(eventData.delta)
          }
        }

        // stream="lifecycle" => run lifecycle events
        if (stream === 'lifecycle') {
          const phase = eventData?.phase

          if (phase === 'start') {
            clearResponse()
            setStreaming(true)
            setOverlayStatus('responding')
          }

          if (phase === 'end' || phase === 'done') {
            setStreaming(false)
            setOverlayStatus('idle')
            setTranscribedText('')
            addConversation({
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              transcript: lastSentMessageRef.current,
              response: useGatewayStore.getState().streamingResponse,
            })
          }

          if (phase === 'error') {
            setStreaming(false)
            setOverlayStatus('idle')
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
  }, [appendResponse, setStreaming, addConversation, clearResponse])

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [])

  // Keyboard shortcuts within overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (overlayStatus === 'recording') {
          stopRecording()
          setOverlayStatus('idle')
        } else {
          window.voiceClaw.overlay.hide()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [overlayStatus, stopRecording])

  // Status text based on current state
  const statusText = (() => {
    switch (overlayStatus) {
      case 'recording':
        return 'Listening...'
      case 'transcribing':
        return 'Transcribing...'
      case 'responding':
        return 'AI responding...'
      default:
        return 'Click to speak'
    }
  })()

  // Determine volume for Aura orb
  const auraVolume = overlayStatus === 'recording'
    ? volume
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
        {/* Aura Orb - click to record / click to stop */}
        <button
          onClick={handleOrbClick}
          disabled={overlayStatus === 'transcribing' || overlayStatus === 'responding' || status !== 'connected'}
          className="relative w-28 h-28 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed group focus:outline-none"
          aria-label={overlayStatus === 'recording' ? 'Stop recording' : 'Start recording'}
        >
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <AuraVisualizer volume={auraVolume} className="w-full h-full" />
          </div>
          {/* Recording ring indicator */}
          {overlayStatus === 'recording' && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-red-500/60"
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          <div className="relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-claw-surface/60 border border-claw-border/50 group-hover:bg-claw-surface/80 transition-colors">
            {overlayStatus === 'recording' ? (
              /* Stop icon (square) when recording */
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-red-400"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              /* Mic icon when idle */
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  overlayStatus === 'responding'
                    ? 'text-claw-accent'
                    : overlayStatus === 'transcribing'
                    ? 'text-claw-warning'
                    : 'text-claw-text-dim group-hover:text-claw-text transition-colors'
                }
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
          overlayStatus === 'recording'
            ? 'text-red-400'
            : overlayStatus === 'transcribing'
            ? 'text-claw-warning'
            : overlayStatus === 'responding'
            ? 'text-claw-accent'
            : 'text-claw-text-dim'
        }`}>
          {statusText}
        </span>

        {/* Transcribed text display */}
        {transcribedText && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-claw-text-dim italic max-w-lg text-center truncate"
          >
            &ldquo;{transcribedText}&rdquo;
          </motion.div>
        )}

        {/* Text input - fallback */}
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
            disabled={status !== 'connected' || overlayStatus === 'recording'}
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
