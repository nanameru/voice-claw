import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useCallback, useRef, useState } from 'react'
import { AuraVisualizer } from './AuraVisualizer'
import { useVoiceStore } from '../../stores/voice'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import { useConversationStore } from '../../stores/conversation'
import { useTtsStore } from '../../stores/tts'
import { useSettingsStore } from '../../stores/settings'
import { useActivityStore } from '../../stores/activity'
import type { ScreenSnapshot } from '../../stores/ui'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

type OverlayStatus = 'idle' | 'listening' | 'transcribing' | 'responding'

export function VoiceOverlay() {
  const { setTranscript, setListening } = useVoiceStore()
  const { status, clearResponse, setStreaming, appendResponse, isStreaming, streamingResponse } = useGatewayStore()
  const { setView, setPTTActive, setSnapshots, clearSnapshots, snapshots } = useUIStore()
  const { addConversation } = useConversationStore()
  const sessionKeyRef = useRef(`agent:main:${crypto.randomUUID()}`)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>('idle')
  const [transcribedText, setTranscribedText] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const pendingSnapshotsRef = useRef<Promise<ScreenSnapshot[]> | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [snapshotCount, setSnapshotCount] = useState(0)

  // Drag styles: Electron uses -webkit-app-region: drag for frameless window movement
  // Interactive elements (input, button) must be marked as no-drag
  const dragStyle: React.CSSProperties = { WebkitAppRegion: 'drag' } as any
  const noDragStyle: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as any

  // Sync TTS enabled state from settings
  const settingsTtsEnabled = useSettingsStore((s) => s.ttsEnabled)
  useEffect(() => {
    useTtsStore.getState().setEnabled(settingsTtsEnabled)
  }, [settingsTtsEnabled])

  // TTS store
  const isTtsSpeaking = useTtsStore((s) => s.isSpeaking)

  // Activity tracking
  const activity = useActivityStore

  // Track the last sent message for conversation history
  const lastSentMessageRef = useRef('')

  // Resize overlay when expanded state changes
  useEffect(() => {
    const height = expanded ? 240 : 64
    window.voiceClaw.overlay.resize(height).catch(() => {})
  }, [expanded])

  // Filter out Whisper hallucinations
  const isWhisperHallucination = useCallback((text: string): boolean => {
    const t = text.trim().replace(/[。！!.…]+$/g, '')
    if (t.length <= 1) return true

    const hallucinations = [
      'ご清聴ありがとう', 'ご視聴ありがとう', 'ありがとうございました',
      'お疲れ様でした', 'お疲れさまでした', 'おつかれさまでした',
      'おやすみなさい', 'では、また', 'ではまた',
      'チャンネル登録', 'グッドボタン', 'いいねボタン', '高評価',
      'チャンネル', '字幕', 'サブタイトル',
      'ご覧いただき', 'ご覧頂き', 'お聞きいただき',
      'お待ちください', 'しばらくお待ち', '最後までご覧',
      'Thank you for watching', 'Thanks for watching', 'Thank you',
      'Bye bye', 'Goodbye', 'See you', 'Subscribe', 'subtitles',
      'MBS', 'NBC', 'NHK',
    ]

    return hallucinations.some((h) => t.includes(h))
  }, [])

  /**
   * Build screen context description from snapshots.
   * Includes cursor positions over time to show what the user was looking at.
   */
  const buildScreenContext = useCallback((snaps: ScreenSnapshot[]): {
    description: string
    screenshots: Array<{ base64: string; cursor: { x: number; y: number }; timestamp: number }>
  } | null => {
    if (!snaps || snaps.length === 0) return null

    const cursorPath = snaps.map((s, i) => {
      const elapsed = i === 0 ? 0 : ((s.timestamp - snaps[0].timestamp) / 1000).toFixed(1)
      return `  ${elapsed}s: cursor at (${s.cursor.x}, ${s.cursor.y})`
    }).join('\n')

    const description = [
      `[Screen context: ${snaps.length} screenshot(s) captured during speech]`,
      `[Cursor movement during recording:]`,
      cursorPath,
    ].join('\n')

    return {
      description,
      screenshots: snaps.map((s) => ({
        base64: s.base64,
        cursor: s.cursor,
        timestamp: s.timestamp,
      })),
    }
  }, [])

  // Send message to gateway with snapshots
  const sendMessage = useCallback(async (message?: string) => {
    const msg = (message || textInput).trim()
    if (!msg) return
    if (status !== 'connected') return

    clearResponse()
    setStreaming(true)
    setOverlayStatus('responding')
    setExpanded(true)
    setTextInput('')
    lastSentMessageRef.current = msg

    if (!activity.getState().currentEntryId) {
      activity.getState().startActivity()
      activity.getState().setUserInput(msg)
    }
    activity.getState().addStep('sending')

    // Build message with screen context
    const currentSnapshots = useUIStore.getState().snapshots
    console.log(`[VoiceClaw] sendMessage: ${currentSnapshots.length} snapshots available, sizes: ${currentSnapshots.map(s => `${(s.base64.length / 1024).toFixed(0)}KB`).join(', ') || 'none'}`)

    const screenCtx = buildScreenContext(currentSnapshots)
    let fullMessage = msg
    if (screenCtx) {
      fullMessage = `${screenCtx.description}\n\n${msg}`
    }

    // Convert screenshots to Gateway-compatible attachments format
    // Gateway expects: { type: "image", mimeType: string, content: base64 }
    const attachments = screenCtx
      ? screenCtx.screenshots.map((s) => ({
          type: 'image' as const,
          mimeType: 'image/jpeg',
          content: s.base64,
        }))
      : undefined

    console.log(`[VoiceClaw] Sending chat.send with ${attachments?.length ?? 0} attachments`)

    await window.voiceClaw.gateway.send('chat.send', {
      sessionKey: sessionKeyRef.current,
      message: fullMessage,
      deliver: false,
      idempotencyKey: crypto.randomUUID(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    })

    // Clear snapshots after sending
    clearSnapshots()
    setSnapshotCount(0)

    activity.getState().completeStep('sending')
    activity.getState().addStep('responding')
  }, [textInput, status, clearResponse, setStreaming, clearSnapshots, buildScreenContext])

  // Start recording (PTT)
  const startRecording = useCallback(async () => {
    try {
      pendingSnapshotsRef.current = null
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Clean up stream
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []

        if (audioBlob.size < 1000) {
          setOverlayStatus('idle')
          pendingSnapshotsRef.current = null
          clearSnapshots() // Security: clear snapshots on error path
          setSnapshotCount(0)
          activity.getState().failActivity('No speech detected')
          return
        }

        // Transcribe
        setOverlayStatus('transcribing')
        activity.getState().addStep('transcribing', `${(audioBlob.size / 1024).toFixed(0)}KB`)

        try {
          const arrayBuffer = await audioBlob.arrayBuffer()
          const text = await window.voiceClaw.audio.transcribe(arrayBuffer)
          activity.getState().completeStep('transcribing')

          if (text && text.trim() && !isWhisperHallucination(text)) {
            const collectedSnapshots = await (pendingSnapshotsRef.current ?? Promise.resolve([]))
            pendingSnapshotsRef.current = null
            if (collectedSnapshots.length > 0) {
              setSnapshots(collectedSnapshots)
              setSnapshotCount(collectedSnapshots.length)

              // Security: TTL safety net — auto-clear snapshots after 30s
              // in case sendMessage is never reached (gateway disconnect, etc.)
              setTimeout(() => {
                const current = useUIStore.getState().snapshots
                if (current.length > 0) {
                  clearSnapshots()
                  setSnapshotCount(0)
                }
              }, 30_000)
            }

            setTranscribedText(text.trim())
            setTranscript(text.trim())
            activity.getState().setTranscribedText(text.trim())
            await sendMessage(text.trim())
          } else {
            setOverlayStatus('idle')
            pendingSnapshotsRef.current = null
            clearSnapshots() // Security: clear on hallucination/no-speech
            setSnapshotCount(0)
            activity.getState().failActivity(
              isWhisperHallucination(text) ? 'Filtered hallucination' : 'No speech detected'
            )
          }
        } catch (err) {
          console.error('Transcription error:', err)
          setOverlayStatus('idle')
          pendingSnapshotsRef.current = null
          clearSnapshots() // Security: clear on transcription failure
          setSnapshotCount(0)
          activity.getState().failActivity(
            `Transcription failed: ${err instanceof Error ? err.message : 'unknown'}`
          )
        }
      }

      mediaRecorder.start(100)
      setOverlayStatus('listening')
      setListening(true)
      activity.getState().startActivity()
      activity.getState().addStep('recording')
    } catch (err) {
      console.error('Failed to start recording:', err)
      setOverlayStatus('idle')
    }
  }, [setListening, setTranscript, sendMessage, isWhisperHallucination])

  // Stop recording (PTT release) — also collects all snapshots from main process
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      setListening(false)
      activity.getState().completeStep('recording')
    }
    setPTTActive(false)

    // ptt:stop returns all snapshots collected during recording
    pendingSnapshotsRef.current = window.voiceClaw.ptt.stop().catch(() => [])
  }, [setListening, setPTTActive])

  // PTT IPC listeners
  useEffect(() => {
    const unsubStart = window.voiceClaw.ptt.onStart(() => {
      useTtsStore.getState().stop()
      setPTTActive(true)
      setSnapshotCount(0)
      startRecording()
    })

    // Safety: main process force-stop (e.g., 30s timeout if keyup was missed)
    let unsubForceStop: (() => void) | undefined
    if (typeof window.voiceClaw.ptt.onForceStop === 'function') {
      unsubForceStop = window.voiceClaw.ptt.onForceStop(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
      })
    }

    return () => {
      unsubStart()
      unsubForceStop?.()
    }
  }, [startRecording, stopRecording, setPTTActive])

  // keyup listener for PTT stop (Space or Alt release)
  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Alt' || e.key === 'Meta') {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
      }
    }

    window.addEventListener('keyup', handleKeyUp)
    return () => window.removeEventListener('keyup', handleKeyUp)
  }, [stopRecording])

  // Focus loss = auto-stop PTT
  useEffect(() => {
    const handleBlur = () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        stopRecording()
      }
    }

    window.addEventListener('blur', handleBlur)
    return () => window.removeEventListener('blur', handleBlur)
  }, [stopRecording])

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
            setExpanded(true)
          }
        }

        if (stream === 'lifecycle') {
          const phase = eventData?.phase

          if (phase === 'start') {
            clearResponse()
            setStreaming(true)
            setOverlayStatus('responding')
            setExpanded(true)
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

            const tts = useTtsStore.getState()
            if (tts.enabled && response) {
              act.addStep('tts')
              tts.speakDirect(response).then(() => {
                act.completeStep('tts')
                act.addStep('done')
                act.completeStep('done')
                act.completeActivity()
                setOverlayStatus('idle')
              }).catch(() => {
                act.addStep('done')
                act.completeStep('done')
                act.completeActivity()
                setOverlayStatus('idle')
              })
            } else {
              act.addStep('done')
              act.completeStep('done')
              act.completeActivity()
              setOverlayStatus('idle')
            }
          }

          if (phase === 'error') {
            setStreaming(false)
            setOverlayStatus('idle')
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
  }, [appendResponse, setStreaming, addConversation, clearResponse])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecording()
        }
        setExpanded(false)
        window.voiceClaw.overlay.hide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [stopRecording])

  // Determine volume for Aura orb
  const isRecording = overlayStatus === 'listening'
  const auraVolume = isRecording
    ? 0.8
    : isTtsSpeaking
    ? 0.6
    : isStreaming
    ? 0.5
    : 0

  // Status indicator color
  const statusColor = overlayStatus === 'listening'
    ? 'bg-emerald-400'
    : overlayStatus === 'transcribing'
    ? 'bg-yellow-400 animate-pulse'
    : overlayStatus === 'responding'
    ? 'bg-claw-accent animate-pulse'
    : 'bg-claw-text-dim'

  const statusLabel = overlayStatus === 'listening'
    ? 'Recording...'
    : overlayStatus === 'transcribing'
    ? 'Transcribing...'
    : overlayStatus === 'responding'
    ? 'AI responding...'
    : status === 'connected'
    ? 'Ready'
    : 'Disconnected'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="w-full h-full flex flex-col"
    >
      {/* Expanded response area */}
      <AnimatePresence>
        {expanded && streamingResponse && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <div className="h-full overflow-y-auto px-4 py-3">
              <div className="prose prose-invert prose-sm max-w-none text-claw-text text-xs leading-relaxed">
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{streamingResponse}</ReactMarkdown>
              </div>
              {isStreaming && (
                <motion.div
                  className="flex gap-1 mt-1"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  <div className="w-1 h-1 rounded-full bg-claw-accent" />
                  <div className="w-1 h-1 rounded-full bg-claw-accent" />
                  <div className="w-1 h-1 rounded-full bg-claw-accent" />
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom bar — drag to move (via -webkit-app-region: drag) */}
      <div
        className="h-16 min-h-[64px] flex items-center gap-3 px-4"
        style={dragStyle}
      >
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor}`} />

        {/* Mini Aura Visualizer */}
        <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden">
          <AuraVisualizer volume={auraVolume} className="w-full h-full" />
        </div>

        {/* Center: transcript or text input */}
        <div className="flex-1 min-w-0" style={noDragStyle}>
          {overlayStatus === 'listening' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 h-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 bg-emerald-400 rounded-full"
                    animate={{ height: [4, 12 + Math.random() * 8, 4] }}
                    transition={{ duration: 0.4 + i * 0.1, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <span className="text-xs text-emerald-400 font-medium truncate">{statusLabel}</span>
              <span className="text-[10px] text-claw-text-dim">capturing screen</span>
            </div>
          ) : transcribedText && overlayStatus === 'transcribing' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-yellow-300 truncate">{transcribedText}</span>
              {snapshotCount > 0 && (
                <span className="text-[10px] text-claw-text-dim shrink-0">{snapshotCount} screenshots</span>
              )}
            </div>
          ) : overlayStatus === 'responding' ? (
            <span className="text-xs text-claw-accent truncate block">{statusLabel}</span>
          ) : (
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
              placeholder={status === 'connected' ? 'Type or hold Option+Space to talk...' : 'Waiting for Gateway...'}
              disabled={status !== 'connected'}
              className="w-full bg-transparent border-none text-sm text-claw-text placeholder-claw-text-dim focus:outline-none disabled:opacity-40"
              autoFocus
            />
          )}
        </div>

        {/* Send button */}
        {textInput.trim() && overlayStatus === 'idle' && (
          <button
            onClick={() => sendMessage(textInput)}
            disabled={status !== 'connected' || isStreaming}
            className="px-3 py-1.5 bg-claw-accent hover:bg-claw-accent/80 disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors shrink-0"
            style={noDragStyle}
          >
            Send
          </button>
        )}

        {/* Nav buttons */}
        <div className="flex items-center gap-0.5 shrink-0" style={noDragStyle}>
          <button
            onClick={() => setView('skills')}
            className="text-[10px] text-claw-text-dim hover:text-claw-text transition-colors px-1 py-0.5"
          >
            Skills
          </button>
          <button
            onClick={() => setView('history')}
            className="text-[10px] text-claw-text-dim hover:text-claw-text transition-colors px-1 py-0.5"
          >
            History
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-[10px] text-claw-text-dim hover:text-claw-text transition-colors px-1 py-0.5"
          >
            Settings
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={() => {
            setExpanded(false)
            window.voiceClaw.overlay.hide()
          }}
          style={noDragStyle}
          className="text-claw-text-dim hover:text-claw-text transition-colors shrink-0 p-1"
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </motion.div>
  )
}
