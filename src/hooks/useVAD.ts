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
  onVolumeChange?: (volume: number) => void
}

export function useVAD(options: UseVADOptions) {
  const vadRef = useRef<MicVAD | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const speechStartRef = useRef<number>(0)

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
      const vad = await MicVAD.new({
        // Use CDN for VAD model assets (worklet + ONNX model + WASM)
        baseAssetPath: 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/',
        onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/',

        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionFrames: 10, // ~300ms grace period after speech ends
        minSpeechFrames: 5,   // ~150ms minimum speech to avoid false positives
        preSpeechPadFrames: 10, // ~300ms audio before speech start

        onSpeechStart: () => {
          speechStartRef.current = Date.now()
          setIsSpeaking(true)
          options.onSpeechStart?.()
        },

        onSpeechEnd: (audio: Float32Array) => {
          const durationMs = Date.now() - speechStartRef.current
          setIsSpeaking(false)

          // Convert to WAV blob (16kHz mono PCM)
          const wavBlob = float32ToWav(audio, 16000)
          options.onSpeechEnd?.(wavBlob, durationMs)
        },

        onVADMisfire: () => {
          setIsSpeaking(false)
          options.onVADMisfire?.()
        },
      })

      vadRef.current = vad
      vad.start()
      setIsListening(true)
    } catch (err) {
      console.error('VAD start error:', err)
    }
  }, [options])

  const stop = useCallback(() => {
    if (vadRef.current) {
      vadRef.current.pause()
      vadRef.current.destroy()
      vadRef.current = null
    }
    setIsListening(false)
    setIsSpeaking(false)
  }, [])

  return { isListening, isSpeaking, start, stop }
}
