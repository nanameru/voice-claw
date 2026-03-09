import { create } from 'zustand'

interface VoiceState {
  isListening: boolean
  transcript: string
  interimTranscript: string
  error: string | null
  micPermission: 'granted' | 'denied' | 'prompt' | 'unknown'

  setListening: (listening: boolean) => void
  setTranscript: (text: string) => void
  setInterimTranscript: (text: string) => void
  appendTranscript: (text: string) => void
  clearTranscript: () => void
  setError: (error: string | null) => void
  setMicPermission: (status: 'granted' | 'denied' | 'prompt' | 'unknown') => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  isListening: false,
  transcript: '',
  interimTranscript: '',
  error: null,
  micPermission: 'unknown',

  setListening: (listening) => set({ isListening: listening }),
  setTranscript: (text) => set({ transcript: text }),
  setInterimTranscript: (text) => set({ interimTranscript: text }),
  appendTranscript: (text) => set((state) => ({ transcript: state.transcript + ' ' + text })),
  clearTranscript: () => set({ transcript: '', interimTranscript: '' }),
  setError: (error) => set({ error }),
  setMicPermission: (status) => set({ micPermission: status }),
  reset: () => set({ isListening: false, transcript: '', interimTranscript: '', error: null }),
}))
