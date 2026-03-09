import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Gateway
  gateway: {
    send: (method: string, params: Record<string, unknown>) =>
      ipcRenderer.invoke('gateway:send', method, params),
    connect: () => ipcRenderer.invoke('gateway:connect'),
    disconnect: () => ipcRenderer.invoke('gateway:disconnect'),
    getStatus: () => ipcRenderer.invoke('gateway:status'),
    onMessage: (callback: (message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message)
      ipcRenderer.on('gateway:message', handler)
      return () => ipcRenderer.removeListener('gateway:message', handler)
    },
    onStatusChange: (callback: (status: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
      ipcRenderer.on('gateway:status', handler)
      return () => ipcRenderer.removeListener('gateway:status', handler)
    },
  },

  // Overlay
  overlay: {
    hide: () => ipcRenderer.invoke('overlay:hide'),
    onShow: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('overlay:show', handler)
      return () => ipcRenderer.removeListener('overlay:show', handler)
    },
    onHide: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('overlay:hide', handler)
      return () => ipcRenderer.removeListener('overlay:hide', handler)
    },
  },

  // Shortcut
  shortcut: {
    update: (shortcut: string) => ipcRenderer.invoke('shortcut:update', shortcut),
  },

  // Store
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
  },

  // Microphone
  mic: {
    checkPermission: () => ipcRenderer.invoke('mic:check-permission'),
    requestPermission: () => ipcRenderer.invoke('mic:request-permission'),
  },

  // Conversations
  conversations: {
    get: () => ipcRenderer.invoke('conversations:get'),
    add: (conversation: { id: string; timestamp: number; transcript: string; response: string }) =>
      ipcRenderer.invoke('conversations:add', conversation),
    clear: () => ipcRenderer.invoke('conversations:clear'),
  },
}

contextBridge.exposeInMainWorld('voiceClaw', api)

export type VoiceClawAPI = typeof api
