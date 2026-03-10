import { create } from 'zustand'

interface TtsState {
  enabled: boolean
  isSpeaking: boolean
  voice: string

  speak: (message: string) => Promise<void>
  stop: () => void
  setEnabled: (enabled: boolean) => void
  setVoice: (voice: string) => void
  setSpeaking: (speaking: boolean) => void
}

let currentAudio: HTMLAudioElement | null = null
let currentBlobUrl: string | null = null

export const useTtsStore = create<TtsState>((set) => ({
  enabled: false,
  isSpeaking: false,
  voice: 'nova',

  speak: async (message: string) => {
    const state = useTtsStore.getState()
    if (!state.enabled) return

    // Stop any currently playing audio
    state.stop()

    set({ isSpeaking: true })

    try {
      const audioBuffer = await window.voiceClaw.tts.speak(message)
      const blob = new Blob([audioBuffer], { type: 'audio/mp3' })
      const url = URL.createObjectURL(blob)
      currentBlobUrl = url

      const audio = new Audio(url)
      currentAudio = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        currentAudio = null
        currentBlobUrl = null
        set({ isSpeaking: false })
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        currentAudio = null
        currentBlobUrl = null
        set({ isSpeaking: false })
      }

      await audio.play()
    } catch (err) {
      console.error('TTS playback error:', err)
      set({ isSpeaking: false })
    }
  },

  stop: () => {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio = null
    }
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = null
    }
    set({ isSpeaking: false })
  },

  setEnabled: (enabled) => set({ enabled }),
  setVoice: (voice) => set({ voice }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
}))
