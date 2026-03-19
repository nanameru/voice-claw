import { ipcMain, systemPreferences } from 'electron'
import { sendToGateway, rpcGateway, connectToGateway, disconnectGateway, getConnectionStatus } from '../gateway/connection'
import { getGatewayProcessManager } from '../gateway/process'
import { updateShortcut } from './shortcut'
import { hideOverlay, getOverlayWindow, resizeOverlayHeight, stopPTT } from './overlay-window'
import store, { setSecureValue, getSecureValue } from '../utils/store'
import { logger } from '../utils/logger'
import { setupAudioHandlers } from '../audio/whisper'
import { setupTtsHandlers } from '../audio/tts'
import { stopPeriodicCapture, getScreenPermissionStatus } from '../utils/screenshot'
import { findOpenClawBinary, getOpenClawVersion, installOpenClawCLI } from '../utils/cli-installer'

// ── Security: Store key allowlist ──────────────────────
const STORE_ALLOWED_KEYS = new Set([
  'shortcut',
  'onboarded',
  'audio',
  'gateway',
  'tts',
])

// ── Security: Gateway method whitelist ─────────────────
const GATEWAY_ALLOWED_METHODS = new Set([
  'chat.send',
  'chat.cancel',
  'session.create',
  'session.destroy',
  'session.list',
  'ping',
])

// Methods allowed for RPC (request-response pattern)
const GATEWAY_RPC_ALLOWED_METHODS = new Set([
  'chat.send',
  'chat.cancel',
  'session.create',
  'session.destroy',
  'session.list',
  'ping',
  // Skills management
  'skills.status',
  'skills.update',
  // Cron management
  'cron.list',
  'cron.add',
  'cron.update',
  'cron.remove',
  'cron.run',
])

// ── Security: Shortcut accelerator validation ──────────
const ACCELERATOR_PATTERN = /^(Command|Cmd|Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Option|AltGr|Shift|Super|Meta)(\+(Command|Cmd|Control|Ctrl|CommandOrControl|CmdOrCtrl|Alt|Option|AltGr|Shift|Super|Meta))*\+([A-Za-z0-9]|F[1-9]|F1[0-9]|F2[0-4]|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|Plus)$/

function isValidAccelerator(shortcut: string): boolean {
  return ACCELERATOR_PATTERN.test(shortcut)
}

// ── Security: Conversation input validation ────────────
function isValidConversation(conv: unknown): conv is {
  id: string
  timestamp: number
  transcript: string
  response: string
} {
  if (!conv || typeof conv !== 'object') return false
  const c = conv as Record<string, unknown>
  return (
    typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 128 &&
    typeof c.timestamp === 'number' && c.timestamp > 0 && Number.isFinite(c.timestamp) &&
    typeof c.transcript === 'string' && c.transcript.length <= 50000 &&
    typeof c.response === 'string' && c.response.length <= 100000
  )
}

export function setupIpcHandlers(): void {
  // Gateway send with method whitelist
  ipcMain.handle('gateway:send', (_event, method: string, params: Record<string, unknown>) => {
    if (typeof method !== 'string' || !GATEWAY_ALLOWED_METHODS.has(method)) {
      logger.warn(`Blocked gateway method call: ${method}`)
      throw new Error(`Gateway method not allowed: ${method}`)
    }
    if (params !== null && params !== undefined && typeof params !== 'object') {
      throw new Error('Invalid params: must be an object')
    }
    sendToGateway(method, params)
  })

  ipcMain.handle('gateway:connect', () => {
    const win = getOverlayWindow()
    if (win) connectToGateway(win)
  })

  ipcMain.handle('gateway:disconnect', () => {
    disconnectGateway()
  })

  ipcMain.handle('gateway:status', () => {
    return getConnectionStatus()
  })

  // Shortcut update with accelerator validation
  ipcMain.handle('shortcut:update', (_event, shortcut: string) => {
    if (typeof shortcut !== 'string' || !isValidAccelerator(shortcut)) {
      throw new Error(`Invalid shortcut accelerator: ${shortcut}`)
    }
    return updateShortcut(shortcut)
  })

  ipcMain.handle('overlay:hide', () => {
    hideOverlay()
  })

  // Store access with allowlist
  ipcMain.handle('store:get', (_event, key: string) => {
    if (typeof key !== 'string' || !STORE_ALLOWED_KEYS.has(key)) {
      logger.warn(`Blocked store:get for unauthorized key: ${key}`)
      throw new Error(`Store access denied for key: ${key}`)
    }
    const value = store.get(key as any)
    // For audio key, reconstruct with decrypted whisperApiKey
    if (key === 'audio' && value && typeof value === 'object') {
      const audio = value as Record<string, unknown>
      return { ...audio, whisperApiKey: getSecureValue('whisperApiKey') }
    }
    // For tts key, reconstruct with decrypted ttsApiKey
    if (key === 'tts' && value && typeof value === 'object') {
      const tts = value as Record<string, unknown>
      return { ...tts, apiKey: getSecureValue('ttsApiKey') }
    }
    return value
  })

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    if (typeof key !== 'string' || !STORE_ALLOWED_KEYS.has(key)) {
      logger.warn(`Blocked store:set for unauthorized key: ${key}`)
      throw new Error(`Store access denied for key: ${key}`)
    }
    // Validate gateway host/port to prevent redirect attacks
    if (key === 'gateway' && value && typeof value === 'object') {
      const gw = value as Record<string, unknown>
      if (typeof gw.host !== 'string' || typeof gw.port !== 'number') {
        throw new Error('Invalid gateway config shape')
      }
      // Only allow localhost connections
      const allowedHosts = ['localhost', '127.0.0.1', '::1']
      if (!allowedHosts.includes(gw.host)) {
        logger.warn(`Blocked gateway host change to: ${gw.host}`)
        throw new Error('Gateway host must be localhost for security')
      }
      if (!Number.isInteger(gw.port) || gw.port < 1 || gw.port > 65535) {
        throw new Error('Invalid gateway port')
      }
    }
    // Validate and securely store audio config
    if (key === 'audio' && value && typeof value === 'object') {
      const audio = value as Record<string, unknown>
      const validEngines = ['webspeech', 'whisper']
      if (audio.engine !== undefined && !validEngines.includes(audio.engine as string)) {
        throw new Error('Invalid audio engine')
      }
      if (audio.deviceId !== undefined && audio.deviceId !== null && typeof audio.deviceId !== 'string') {
        throw new Error('Invalid audio deviceId')
      }
      // Extract and encrypt whisperApiKey separately
      if (typeof audio.whisperApiKey === 'string') {
        setSecureValue('whisperApiKey', audio.whisperApiKey)
      }
      // Store audio config WITHOUT the plaintext API key
      const { whisperApiKey: _key, ...safeAudio } = audio
      store.set('audio' as any, { ...safeAudio, whisperApiKey: '' })
      return
    }
    // Validate and securely store TTS config
    if (key === 'tts' && value && typeof value === 'object') {
      const tts = value as Record<string, unknown>
      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
      if (tts.voice !== undefined && !validVoices.includes(tts.voice as string)) {
        throw new Error('Invalid TTS voice')
      }
      // Extract and encrypt apiKey separately
      if (typeof tts.apiKey === 'string') {
        setSecureValue('ttsApiKey', tts.apiKey)
      }
      const { apiKey: _key, ...safeTts } = tts
      store.set('tts' as any, safeTts)
      return
    }
    // Validate shortcut accelerator format
    if (key === 'shortcut') {
      if (typeof value !== 'string' || !isValidAccelerator(value)) {
        logger.warn(`Blocked invalid shortcut via store:set: ${value}`)
        throw new Error('Invalid shortcut accelerator')
      }
    }
    // Validate onboarded is boolean
    if (key === 'onboarded') {
      if (typeof value !== 'boolean') {
        throw new Error('Invalid value for onboarded: must be boolean')
      }
    }
    store.set(key as any, value)
  })

  ipcMain.handle('mic:check-permission', async () => {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('microphone')
      return status
    }
    return 'granted'
  })

  ipcMain.handle('mic:request-permission', async () => {
    if (process.platform === 'darwin') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      return granted
    }
    return true
  })

  ipcMain.handle('conversations:get', () => {
    return store.get('conversations')
  })

  // Conversation add with input validation
  ipcMain.handle('conversations:add', (_event, conversation: unknown) => {
    if (!isValidConversation(conversation)) {
      throw new Error('Invalid conversation data')
    }
    const conversations = store.get('conversations')
    conversations.unshift(conversation)
    // Keep last 100 conversations
    if (conversations.length > 100) {
      conversations.length = 100
    }
    store.set('conversations', conversations)
  })

  ipcMain.handle('conversations:clear', () => {
    store.set('conversations', [])
  })

  // Audio transcription (Whisper API)
  setupAudioHandlers()

  // TTS (voice acknowledgment + speech synthesis)
  setupTtsHandlers()

  // Gateway process management
  ipcMain.handle('gateway:process-status', () => {
    return getGatewayProcessManager().getStatus()
  })

  ipcMain.handle('gateway:process-start', async () => {
    try {
      await getGatewayProcessManager().start()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('gateway:process-stop', async () => {
    try {
      await getGatewayProcessManager().stop()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle('gateway:process-restart', async () => {
    try {
      await getGatewayProcessManager().restart()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  // ── Gateway RPC (Promise-based request-response) ──────
  ipcMain.handle('gateway:rpc', async (_event, method: string, params?: Record<string, unknown>, timeoutMs?: number) => {
    if (typeof method !== 'string' || !GATEWAY_RPC_ALLOWED_METHODS.has(method)) {
      logger.warn(`Blocked gateway RPC method: ${method}`)
      throw new Error(`Gateway RPC method not allowed: ${method}`)
    }
    if (params !== null && params !== undefined && typeof params !== 'object') {
      throw new Error('Invalid params: must be an object')
    }
    if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || timeoutMs < 1000 || timeoutMs > 60000)) {
      throw new Error('Invalid timeout: must be 1000-60000ms')
    }
    return await rpcGateway(method, params || {}, timeoutMs)
  })

  // ── Screen Recording permission check ───────────────────
  ipcMain.handle('screen:check-permission', () => {
    return getScreenPermissionStatus()
  })

  // ── Overlay resize ─────────────────────────────────────
  ipcMain.handle('overlay:resize', (_event, height: number) => {
    if (typeof height !== 'number' || height < 64 || height > 400) {
      throw new Error('Invalid overlay height: must be 64-400')
    }
    resizeOverlayHeight(height)
  })

  // ── PTT stop (from renderer) ───────────────────────────
  ipcMain.handle('ptt:stop', () => {
    stopPTT()
    // Stop periodic capture and return all snapshots
    return stopPeriodicCapture()
  })

  // ── Setup: CLI check & install ───────────────────────
  ipcMain.handle('setup:check-cli', async () => {
    const binary = findOpenClawBinary()
    if (!binary) return { installed: false }
    const version = getOpenClawVersion(binary)
    return { installed: true, path: binary, version }
  })

  ipcMain.handle('setup:install-cli', async (event) => {
    return await installOpenClawCLI((progress) => {
      // Send progress to renderer
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('setup:install-progress', progress)
      }
    })
  })

  ipcMain.handle('setup:check-gateway', async () => {
    const manager = getGatewayProcessManager()
    return manager.getStatus()
  })

  ipcMain.handle('setup:start-gateway', async () => {
    const manager = getGatewayProcessManager()
    try {
      await manager.start()
      return { ok: true, status: manager.getStatus() }
    } catch (err) {
      return { ok: false, error: String(err), status: manager.getStatus() }
    }
  })

  ipcMain.handle('setup:connect-gateway', async () => {
    const win = getOverlayWindow()
    if (win) {
      await connectToGateway(win)
      return { ok: true }
    }
    return { ok: false, error: 'No window available' }
  })
}
