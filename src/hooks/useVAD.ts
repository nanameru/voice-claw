import { useRef, useCallback, useState } from 'react'
import { MicVAD } from '@ricky0123/vad-web'

/** Convert Float32Array (16kHz) to WAV Blob for Whisper API */
function float32ToWav(samples: Float32Array, sampleRate = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

interface UseVADOptions {
  onSpeechStart?: () => void
  onSpeechEnd?: (audioBlob: Blob, durationMs: number) => void
  onVADMisfire?: () => void
  onInterimAudio?: (audioBlob: Blob) => void
}

const INTERIM_INTERVAL_MS = 1500 // Send interim audio every 1.5 seconds

export function useVAD(options: UseVADOptions) {
  const vadRef = useRef<MicVAD | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const speechStartRef = useRef<number>(0)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const interimTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startInterimRecording = useCallback((stream: MediaStream) => {
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    chunksRef.current = []
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.start(500) // Collect chunks every 500ms

    // Send accumulated audio for interim transcription every INTERIM_INTERVAL_MS
    interimTimerRef.current = setInterval(() => {
      if (chunksRef.current.length > 0 && options.onInterimAudio) {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        options.onInterimAudio(blob)
      }
    }, INTERIM_INTERVAL_MS)
  }, [options])

  const stopInterimRecording = useCallback(() => {
    if (interimTimerRef.current) {
      clearInterval(interimTimerRef.current)
      interimTimerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const start = useCallback(async () => {
    if (vadRef.current) return

    // Check and request microphone permission before starting VAD
    try {
      const micStatus = await window.voiceClaw.mic.checkPermission()
      if (micStatus !== 'granted') {
        const granted = await window.voiceClaw.mic.requestPermission()
        if (!granted) {
          console.error('Microphone permission denied')
          return
        }
      }
    } catch (err) {
      console.error('Microphone permission check failed:', err)
    }

    try {
      // Get microphone stream to share between VAD and MediaRecorder
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      })
      mediaStreamRef.current = stream

      const vad = await MicVAD.new({
        // Serve VAD worklet + model from local public/ directory
        baseAssetPath: '/vad/',
        stream, // Share the same microphone stream

        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionFrames: 10,
        minSpeechFrames: 5,
        preSpeechPadFrames: 10,

        onSpeechStart: () => {
          speechStartRef.current = Date.now()
          setIsSpeaking(true)
          // Start interim recording for real-time transcription
          if (mediaStreamRef.current) {
            startInterimRecording(mediaStreamRef.current)
          }
          options.onSpeechStart?.()
        },

        onSpeechEnd: (audio: Float32Array) => {
          const durationMs = Date.now() - speechStartRef.current
          setIsSpeaking(false)
          stopInterimRecording()

          // Convert to WAV blob (16kHz mono PCM)
          const wavBlob = float32ToWav(audio, 16000)
          options.onSpeechEnd?.(wavBlob, durationMs)
        },

        onVADMisfire: () => {
          setIsSpeaking(false)
          stopInterimRecording()
          options.onVADMisfire?.()
        },
      })

      vadRef.current = vad
      vad.start()
      setIsListening(true)
    } catch (err) {
      console.error('VAD start error:', err)
    }
  }, [options, startInterimRecording, stopInterimRecording])

  const stop = useCallback(() => {
    stopInterimRecording()
    if (vadRef.current) {
      vadRef.current.pause()
      vadRef.current.destroy()
      vadRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }
    setIsListening(false)
    setIsSpeaking(false)
  }, [stopInterimRecording])

  return { isListening, isSpeaking, start, stop }
}
