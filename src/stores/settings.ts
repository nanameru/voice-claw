import { create } from 'zustand'

interface SettingsState {
  gatewayHost: string
  gatewayPort: number
  shortcut: string
  audioDeviceId: string | null
  audioEngine: 'webspeech' | 'whisper'
  sttProvider: 'openai' | 'groq'
  whisperApiKey: string
  onboarded: boolean
  ttsEnabled: boolean
  ttsVoice: string
  ttsApiKey: string

  loadSettings: () => Promise<void>
  updateGateway: (host: string, port: number) => Promise<void>
  updateShortcut: (shortcut: string) => Promise<boolean>
  updateAudioDevice: (deviceId: string | null) => Promise<void>
  updateAudioEngine: (engine: 'webspeech' | 'whisper') => Promise<void>
  updateWhisperApiKey: (key: string) => Promise<void>
  setOnboarded: (onboarded: boolean) => Promise<void>
  updateTtsEnabled: (enabled: boolean) => Promise<void>
  updateTtsVoice: (voice: string) => Promise<void>
  updateTtsApiKey: (key: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  gatewayHost: 'localhost',
  gatewayPort: 18789,
  shortcut: 'Alt+Space',
  audioDeviceId: null,
  audioEngine: 'whisper',
  sttProvider: 'groq',
  whisperApiKey: '',
  onboarded: false,
  ttsEnabled: false,
  ttsVoice: 'nova',
  ttsApiKey: '',

  loadSettings: async () => {
    const gateway = (await window.voiceClaw.store.get('gateway')) as { host: string; port: number }
    const shortcut = (await window.voiceClaw.store.get('shortcut')) as string
    const audio = (await window.voiceClaw.store.get('audio')) as {
      deviceId: string | null
      engine: 'webspeech' | 'whisper'
      sttProvider: 'openai' | 'groq'
      whisperApiKey: string
    }
    const onboarded = (await window.voiceClaw.store.get('onboarded')) as boolean

    const tts = (await window.voiceClaw.store.get('tts')) as {
      enabled: boolean
      voice: string
      provider: 'openai'
      apiKey: string
    }

    set({
      gatewayHost: gateway.host,
      gatewayPort: gateway.port,
      shortcut,
      audioDeviceId: audio.deviceId,
      audioEngine: audio.engine,
      sttProvider: audio.sttProvider || 'groq',
      whisperApiKey: audio.whisperApiKey,
      onboarded,
      ttsEnabled: tts?.enabled ?? false,
      ttsVoice: tts?.voice ?? 'nova',
      ttsApiKey: tts?.apiKey ?? '',
    })
  },

  updateGateway: async (host, port) => {
    await window.voiceClaw.store.set('gateway', { host, port })
    set({ gatewayHost: host, gatewayPort: port })
  },

  updateShortcut: async (shortcut) => {
    const success = await window.voiceClaw.shortcut.update(shortcut)
    if (success) set({ shortcut })
    return success
  },

  updateAudioDevice: async (deviceId) => {
    const audio = (await window.voiceClaw.store.get('audio')) as Record<string, unknown>
    await window.voiceClaw.store.set('audio', { ...audio, deviceId })
    set({ audioDeviceId: deviceId })
  },

  updateAudioEngine: async (engine) => {
    const audio = (await window.voiceClaw.store.get('audio')) as Record<string, unknown>
    await window.voiceClaw.store.set('audio', { ...audio, engine })
    set({ audioEngine: engine })
  },

  updateWhisperApiKey: async (key) => {
    const audio = (await window.voiceClaw.store.get('audio')) as Record<string, unknown>
    await window.voiceClaw.store.set('audio', { ...audio, whisperApiKey: key })
    set({ whisperApiKey: key })
  },

  setOnboarded: async (onboarded) => {
    await window.voiceClaw.store.set('onboarded', onboarded)
    set({ onboarded })
  },

  updateTtsEnabled: async (enabled) => {
    const tts = (await window.voiceClaw.store.get('tts')) as Record<string, unknown>
    await window.voiceClaw.store.set('tts', { ...tts, enabled })
    set({ ttsEnabled: enabled })
  },

  updateTtsVoice: async (voice) => {
    const tts = (await window.voiceClaw.store.get('tts')) as Record<string, unknown>
    await window.voiceClaw.store.set('tts', { ...tts, voice })
    set({ ttsVoice: voice })
  },

  updateTtsApiKey: async (key) => {
    const tts = (await window.voiceClaw.store.get('tts')) as Record<string, unknown>
    await window.voiceClaw.store.set('tts', { ...tts, apiKey: key })
    set({ ttsApiKey: key })
  },
}))
