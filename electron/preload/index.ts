import { contextBridge, ipcRenderer } from 'electron'

// ── Security: IPC channel allowlists ──────────────────
const INVOKE_ALLOWED = new Set([
  'gateway:send',
  'gateway:connect',
  'gateway:disconnect',
  'gateway:status',
  'gateway:process-status',
  'gateway:process-start',
  'gateway:process-stop',
  'gateway:process-restart',
  'shortcut:update',
  'overlay:hide',
  'store:get',
  'store:set',
  'mic:check-permission',
  'mic:request-permission',
  'audio:transcribe',
  'tts:speak',
  'tts:synthesize',
  'conversations:get',
  'conversations:add',
  'conversations:clear',
])

const ON_ALLOWED = new Set([
  'gateway:message',
  'gateway:status',
  'gateway:event',
  'gateway:process-status',
  'overlay:show',
  'overlay:hide',
])

function safeInvoke(channel: string, ...args: unknown[]) {
  if (!INVOKE_ALLOWED.has(channel)) {
    throw new Error(`IPC invoke channel not allowed: ${channel}`)
  }
  return ipcRenderer.invoke(channel, ...args)
}

function safeOn(channel: string, handler: (...args: unknown[]) => void) {
  if (!ON_ALLOWED.has(channel)) {
    throw new Error(`IPC on channel not allowed: ${channel}`)
  }
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  // Gateway
  gateway: {
    send: (method: string, params: Record<string, unknown>) =>
      safeInvoke('gateway:send', method, params),
    connect: () => safeInvoke('gateway:connect'),
    disconnect: () => safeInvoke('gateway:disconnect'),
    getStatus: () => safeInvoke('gateway:status'),
    onMessage: (callback: (message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message)
      return safeOn('gateway:message', handler as (...args: unknown[]) => void)
    },
    onStatusChange: (callback: (status: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
      return safeOn('gateway:status', handler as (...args: unknown[]) => void)
    },
    onEvent: (callback: (event: { event: string; payload: unknown }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: { event: string; payload: unknown }) => callback(data)
      return safeOn('gateway:event', handler as (...args: unknown[]) => void)
    },
  },

  // Overlay
  overlay: {
    hide: () => safeInvoke('overlay:hide'),
    onShow: (callback: () => void) => {
      const handler = () => callback()
      return safeOn('overlay:show', handler)
    },
    onHide: (callback: () => void) => {
      const handler = () => callback()
      return safeOn('overlay:hide', handler)
    },
  },

  // Shortcut
  shortcut: {
    update: (shortcut: string) => safeInvoke('shortcut:update', shortcut),
  },

  // Store
  store: {
    get: (key: string) => safeInvoke('store:get', key),
    set: (key: string, value: unknown) => safeInvoke('store:set', key, value),
  },

  // Microphone
  mic: {
    checkPermission: () => safeInvoke('mic:check-permission'),
    requestPermission: () => safeInvoke('mic:request-permission'),
  },

  // Audio transcription
  audio: {
    transcribe: (audioData: ArrayBuffer) => safeInvoke('audio:transcribe', audioData),
  },

  // TTS (voice acknowledgment + speech synthesis)
  tts: {
    speak: (message: string) => safeInvoke('tts:speak', message),
    synthesize: (text: string) => safeInvoke('tts:synthesize', text),
  },

  // Conversations
  conversations: {
    get: () => safeInvoke('conversations:get'),
    add: (conversation: { id: string; timestamp: number; transcript: string; response: string }) =>
      safeInvoke('conversations:add', conversation),
    clear: () => safeInvoke('conversations:clear'),
  },
}

contextBridge.exposeInMainWorld('voiceClaw', api)

export type VoiceClawAPI = typeof api
