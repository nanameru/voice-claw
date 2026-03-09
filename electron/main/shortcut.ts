import { globalShortcut } from 'electron'
import { toggleOverlay } from './overlay-window'
import { logger } from '../utils/logger'
import store from '../utils/store'

let currentShortcut: string | null = null

export function registerShortcut(): void {
  const shortcut = store.get('shortcut')
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  const success = globalShortcut.register(shortcut, () => {
    toggleOverlay()
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

  const success = globalShortcut.register(newShortcut, () => {
    toggleOverlay()
  })

  if (success) {
    currentShortcut = newShortcut
    store.set('shortcut', newShortcut)
    logger.info(`Shortcut updated: ${newShortcut}`)
    return true
  } else {
    // Re-register old shortcut
    if (currentShortcut) {
      globalShortcut.register(currentShortcut, () => {
        toggleOverlay()
      })
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
