import { globalShortcut } from 'electron'
import { startPTT, hideOverlay, getOverlayWindow, isPTTActive } from './overlay-window'
import { startPeriodicCapture, stopPeriodicCapture } from '../utils/screenshot'
import { logger } from '../utils/logger'
import store from '../utils/store'

let currentShortcut: string | null = null

// ── PTT timeout safety net ─────────────────────────────
// If keyup is missed (e.g., window loses focus), auto-stop after 30s
let pttTimeout: NodeJS.Timeout | null = null
const PTT_MAX_DURATION_MS = 30_000

export function clearPTTTimeout(): void {
  if (pttTimeout) {
    clearTimeout(pttTimeout)
    pttTimeout = null
  }
}

export function stopPTTFromMain(): void {
  clearPTTTimeout()
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ptt:force-stop')
  }
}

function pttHandler() {
  const win = getOverlayWindow()
  if (!win) return

  // If PTT is currently active (recording in progress), ignore re-press
  // The keyup in the renderer will handle stopping
  if (isPTTActive()) {
    return
  }

  // If overlay is visible but idle (showing previous response), start new PTT
  // Only hide if user presses Escape (handled in renderer)

  // Start PTT mode + periodic screenshot capture (every 2s)
  startPTT()
  startPeriodicCapture(2000)

  // Safety timeout: auto-stop PTT if keyup is never received
  clearPTTTimeout()
  pttTimeout = setTimeout(() => {
    logger.warn('PTT timeout: auto-stopping after 30s')
    stopPTTFromMain()
  }, PTT_MAX_DURATION_MS)
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
