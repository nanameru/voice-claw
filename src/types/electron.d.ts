export interface ScreenSnapshot {
  base64: string
  cursor: { x: number; y: number }
  timestamp: number
}

export interface VoiceClawAPI {
  gateway: {
    send: (method: string, params: Record<string, unknown>) => Promise<void>
    rpc: (method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>
    connect: () => Promise<void>
    disconnect: () => Promise<void>
    getStatus: () => Promise<'connected' | 'connecting' | 'disconnected'>
    onMessage: (callback: (message: unknown) => void) => () => void
    onStatusChange: (callback: (status: string) => void) => () => void
    onEvent: (callback: (event: { event: string; payload: unknown }) => void) => () => void
  }
  overlay: {
    hide: () => Promise<void>
    resize: (height: number) => Promise<void>
    onShow: (callback: () => void) => () => void
    onHide: (callback: () => void) => () => void
  }
  screen: {
    checkPermission: () => Promise<string>
  }
  ptt: {
    /** Stop PTT and return all snapshots captured during recording (main process only) */
    stop: () => Promise<ScreenSnapshot[]>
    onStart: (callback: () => void) => () => void
  }
  shortcut: {
    update: (shortcut: string) => Promise<boolean>
  }
  store: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
  mic: {
    checkPermission: () => Promise<string>
    requestPermission: () => Promise<boolean>
  }
  audio: {
    transcribe: (audioData: ArrayBuffer) => Promise<string>
  }
  tts: {
    speak: (message: string) => Promise<ArrayBuffer>
    synthesize: (text: string) => Promise<ArrayBuffer>
  }
  conversations: {
    get: () => Promise<Array<{
      id: string
      timestamp: number
      transcript: string
      response: string
    }>>
    add: (conversation: {
      id: string
      timestamp: number
      transcript: string
      response: string
    }) => Promise<void>
    clear: () => Promise<void>
  }
  setup: {
    checkCLI: () => Promise<{ installed: boolean; path?: string; version?: string }>
    installCLI: () => Promise<{ success: boolean; path?: string; version?: string; error?: string }>
    onInstallProgress: (callback: (progress: { event: string; message: string; version?: string; path?: string }) => void) => () => void
    checkGateway: () => Promise<{ state: string; port: number; error?: string }>
    startGateway: () => Promise<{ ok: boolean; error?: string; status: { state: string; port: number } }>
    connectGateway: () => Promise<{ ok: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    voiceClaw: VoiceClawAPI
  }
}
