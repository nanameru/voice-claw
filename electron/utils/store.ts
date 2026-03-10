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
  if (!safeStorage.isEncryptionAvailable()) {
    logger.error('safeStorage encryption not available — refusing to store sensitive value in plain text')
    throw new Error('Keychain encryption is unavailable. Cannot securely store API key.')
  }
  try {
    const encrypted = safeStorage.encryptString(plaintext)
    store.set(`_encrypted.${key}` as any, encrypted.toString('base64'))
    // Clean up any legacy plain text entry
    store.delete(`_plain.${key}` as any)
  } catch (err) {
    logger.error('Failed to encrypt value:', err)
    throw new Error('Failed to encrypt API key')
  }
}

export function getSecureValue(key: string): string {
  try {
    // Try encrypted first
    const encrypted = store.get(`_encrypted.${key}` as any) as string | undefined
    if (encrypted && safeStorage.isEncryptionAvailable()) {
      const buffer = Buffer.from(encrypted, 'base64')
      const value = safeStorage.decryptString(buffer)
      return value
    }
    // Migrate legacy plain text to encrypted if possible
    const plain = store.get(`_plain.${key}` as any) as string | undefined
    if (plain) {
      if (safeStorage.isEncryptionAvailable()) {
        logger.info(`Migrating plain text key "${key}" to encrypted storage`)
        const enc = safeStorage.encryptString(plain)
        store.set(`_encrypted.${key}` as any, enc.toString('base64'))
        store.delete(`_plain.${key}` as any)
        return plain
      }
      logger.warn(`Found plain text key "${key}" but encryption unavailable — returning value with warning`)
      return plain
    }
  } catch (err) {
    logger.error('Failed to decrypt value:', err)
  }
  return ''
}

export default store
