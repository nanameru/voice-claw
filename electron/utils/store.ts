import Store from 'electron-store'
import { safeStorage } from 'electron'
import { logger } from './logger'

interface StoreSchema {
  gateway: {
    host: string
    port: number
  }
  shortcut: string
  audio: {
    deviceId: string | null
    engine: 'webspeech' | 'whisper'
    sttProvider: 'openai' | 'groq'
    whisperApiKey: string  // stored encrypted via safeStorage
  }
  tts: {
    enabled: boolean
    voice: string
    provider: 'openai'
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
      engine: 'whisper',
      sttProvider: 'groq',
      whisperApiKey: '',
    },
    tts: {
      enabled: false,
      voice: 'nova',
      provider: 'openai',
    },
    onboarded: false,
    conversations: [],
  },
})

// ── Secure storage helpers for sensitive values ──────────
// Uses Electron's safeStorage API to encrypt/decrypt secrets at rest

export function setSecureValue(key: string, plaintext: string): void {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plaintext)
      store.set(`_encrypted.${key}` as any, encrypted.toString('base64'))
    } else {
      logger.warn('safeStorage encryption not available, storing in plain text')
      store.set(`_plain.${key}` as any, plaintext)
    }
  } catch (err) {
    logger.error('Failed to encrypt value:', err)
  }
}

export function getSecureValue(key: string): string {
  try {
    // Try encrypted first
    const encrypted = store.get(`_encrypted.${key}` as any) as string | undefined
    if (encrypted && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encrypted, 'base64')
      return safeStorage.decryptString(buffer)
    }
    // Fallback to plain text (migration path)
    const plain = store.get(`_plain.${key}` as any) as string | undefined
    if (plain) return plain
  } catch (err) {
    logger.error('Failed to decrypt value:', err)
  }
  return ''
}

export default store
