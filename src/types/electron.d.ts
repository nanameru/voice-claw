export interface VoiceClawAPI {
  gateway: {
    send: (method: string, params: Record<string, unknown>) => Promise<void>
    connect: () => Promise<void>
    disconnect: () => Promise<void>
    getStatus: () => Promise<'connected' | 'connecting' | 'disconnected'>
    onMessage: (callback: (message: unknown) => void) => () => void
    onStatusChange: (callback: (status: string) => void) => () => void
    onEvent: (callback: (event: { event: string; payload: unknown }) => void) => () => void
  }
  overlay: {
    hide: () => Promise<void>
    onShow: (callback: () => void) => () => void
    onHide: (callback: () => void) => () => void
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
}

declare global {
  interface Window {
    voiceClaw: VoiceClawAPI
  }
}
