import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createOverlayWindow, showOverlay } from './overlay-window'
import { registerShortcut, unregisterShortcut } from './shortcut'
import { createTray } from './tray'
import { setupIpcHandlers } from './ipc-handlers'
import { connectToGateway, disconnectGateway } from '../gateway/connection'
import { getGatewayProcessManager } from '../gateway/process'
import { logger } from '../utils/logger'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Catch uncaught exceptions — disconnect gateway and exit gracefully
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err.message)
  try {
    disconnectGateway()
  } catch { /* ignore cleanup errors */ }
  // Exit after a brief delay to allow log flushing
  setTimeout(() => process.exit(1), 500)
})

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

app.whenReady().then(async () => {
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

  // Show overlay once page is loaded, and open DevTools in dev mode
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Page loaded, showing overlay')
    showOverlay()
    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Setup global shortcut
  registerShortcut()

  // Create system tray
  createTray()

  // ── Gateway startup ──────────────────────────────
  // 1. Ensure Gateway process is running (start if needed)
  const gatewayManager = getGatewayProcessManager()

  gatewayManager.on('status', (status) => {
    logger.info(`Gateway status: ${status.state}${status.pid ? ` (pid=${status.pid})` : ''}`)
    // Forward process status to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('gateway:process-status', status)
      } catch { /* ignore */ }
    }
  })

  gatewayManager.on('error', (err) => {
    logger.error('Gateway process error:', err.message)
  })

  try {
    await gatewayManager.start()
    logger.info('Gateway process is running')
  } catch (err) {
    logger.error('Failed to start Gateway process:', err)
    // Continue anyway — user might start it manually later
  }

  // 2. Connect WebSocket to Gateway
  if (mainWindow) {
    connectToGateway(mainWindow)
  }

  logger.info('VoiceClaw ready')
})

app.on('will-quit', async () => {
  unregisterShortcut()
  disconnectGateway()

  // Stop Gateway if we own the process
  const gatewayManager = getGatewayProcessManager()
  if (gatewayManager.ownsGatewayProcess()) {
    logger.info('Stopping owned Gateway process...')
    try {
      await gatewayManager.stop()
    } catch (err) {
      logger.error('Error stopping Gateway:', err)
    }
  }
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
