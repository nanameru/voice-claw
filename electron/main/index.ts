import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createOverlayWindow, showOverlay } from './overlay-window'
import { registerShortcut, unregisterShortcut } from './shortcut'
import { createTray } from './tray'
import { setupIpcHandlers } from './ipc-handlers'
import { connectToGateway, disconnectGateway } from '../gateway/connection'
import { logger } from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// Prevent default window from showing in dock on macOS
if (process.platform === 'darwin') {
  app.dock?.hide()
}

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  logger.info('VoiceClaw starting...')

  // Setup IPC handlers before creating window
  setupIpcHandlers()

  // Create overlay window
  mainWindow = createOverlayWindow()

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Setup global shortcut
  registerShortcut()

  // Create system tray
  createTray()

  // Connect to gateway
  connectToGateway(mainWindow)

  logger.info('VoiceClaw ready')
})

app.on('will-quit', () => {
  unregisterShortcut()
  disconnectGateway()
})

app.on('window-all-closed', () => {
  // Keep running in tray
})

app.on('second-instance', () => {
  // Show overlay when user tries to launch second instance
  if (mainWindow) {
    showOverlay()
  }
})
