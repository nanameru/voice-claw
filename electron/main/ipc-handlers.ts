import { ipcMain, systemPreferences } from 'electron'
import { sendToGateway, connectToGateway, disconnectGateway, getConnectionStatus } from '../gateway/connection'
import { updateShortcut } from './shortcut'
import { hideOverlay, getOverlayWindow } from './overlay-window'
import store from '../utils/store'

export function setupIpcHandlers(): void {
  ipcMain.handle('gateway:send', (_event, method: string, params: Record<string, unknown>) => {
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

  ipcMain.handle('shortcut:update', (_event, shortcut: string) => {
    return updateShortcut(shortcut)
  })

  ipcMain.handle('overlay:hide', () => {
    hideOverlay()
  })

  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key as any)
  })

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
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

  ipcMain.handle('conversations:add', (_event, conversation: {
    id: string
    timestamp: number
    transcript: string
    response: string
  }) => {
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
}
