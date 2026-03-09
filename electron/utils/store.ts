import Store from 'electron-store'

interface StoreSchema {
  gateway: {
    host: string
    port: number
  }
  shortcut: string
  audio: {
    deviceId: string | null
    engine: 'webspeech' | 'whisper'
    whisperApiKey: string
  }
  onboarded: boolean
  conversations: Array<{
    id: string
    timestamp: number
    transcript: string
    response: string
  }>
}

const store = new Store<StoreSchema>({
  defaults: {
    gateway: {
      host: 'localhost',
      port: 18789,
    },
    shortcut: 'Alt+Space',
    audio: {
      deviceId: null,
      engine: 'webspeech',
      whisperApiKey: '',
    },
    onboarded: false,
    conversations: [],
  },
})

export default store
