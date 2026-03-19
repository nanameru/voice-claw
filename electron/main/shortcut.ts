import { globalShortcut } from 'electron'
import { startPTT, hideOverlay, getOverlayWindow } from './overlay-window'
import { startPeriodicCapture, stopPeriodicCapture } from '../utils/screenshot'
import { logger } from '../utils/logger'
import store from '../utils/store'

let currentShortcut: string | null = null

function pttHandler() {
  const win = getOverlayWindow()
  if (!win) return

  if (win.isVisible()) {
    hideOverlay()
    return
  }

  // Start PTT mode + periodic screenshot capture (every 2s)
  startPTT()
  startPeriodicCapture(2000)
}

export function registerShortcut(): void {
  const shortcut = store.get('shortcut')
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  const success = globalShortcut.register(shortcut, pttHandler)

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

  const success = globalShortcut.register(newShortcut, pttHandler)

  if (success) {
    currentShortcut = newShortcut
    store.set('shortcut', newShortcut)
    logger.info(`Shortcut updated: ${newShortcut}`)
    return true
  } else {
    if (currentShortcut) {
      globalShortcut.register(currentShortcut, pttHandler)
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
