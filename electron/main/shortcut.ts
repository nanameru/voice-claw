import { globalShortcut } from 'electron'
import { startPTT, hideOverlay, getOverlayWindow } from './overlay-window'
import { captureScreen } from '../utils/screenshot'
import { logger } from '../utils/logger'
import store from '../utils/store'

let currentShortcut: string | null = null

export function registerShortcut(): void {
  const shortcut = store.get('shortcut')
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  const success = globalShortcut.register(shortcut, () => {
    const win = getOverlayWindow()
    if (!win) return

    if (win.isVisible()) {
      // If already visible, hide (toggle off)
      hideOverlay()
      return
    }

    // Start PTT mode
    startPTT()

    // Capture screenshot asynchronously and send to renderer
    captureScreen().then((base64) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ptt:screenshot', base64)
      }
    }).catch((err) => {
      logger.error('Screenshot capture failed:', err)
    })
  })

  if (success) {
    currentShortcut = shortcut
    logger.info(`Global shortcut registered: ${shortcut}`)
  } else {
    logger.error(`Failed to register shortcut: ${shortcut}`)
  }
}

export function updateShortcut(newShortcut: string): boolean {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  const handler = () => {
    const win = getOverlayWindow()
    if (!win) return

    if (win.isVisible()) {
      hideOverlay()
      return
    }

    startPTT()
    captureScreen().then((base64) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('ptt:screenshot', base64)
      }
    }).catch((err) => {
      logger.error('Screenshot capture failed:', err)
    })
  }

  const success = globalShortcut.register(newShortcut, handler)

  if (success) {
    currentShortcut = newShortcut
    store.set('shortcut', newShortcut)
    logger.info(`Shortcut updated: ${newShortcut}`)
    return true
  } else {
    // Re-register old shortcut
    if (currentShortcut) {
      globalShortcut.register(currentShortcut, handler)
    }
    logger.error(`Failed to register new shortcut: ${newShortcut}`)
    return false
  }
}

export function unregisterShortcut(): void {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
    currentShortcut = null
  }
}
