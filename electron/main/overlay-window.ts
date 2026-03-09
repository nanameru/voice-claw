import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let overlayWindow: BrowserWindow | null = null

export function createOverlayWindow(): BrowserWindow {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

  const windowWidth = 680
  const windowHeight = 520

  overlayWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.round((screenWidth - windowWidth) / 2),
    y: 120,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  overlayWindow.on('blur', () => {
    hideOverlay()
  })

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  return overlayWindow
}

export function toggleOverlay(): void {
  if (!overlayWindow) return

  if (overlayWindow.isVisible()) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

export function showOverlay(): void {
  if (!overlayWindow) return
  overlayWindow.show()
  overlayWindow.focus()
  overlayWindow.webContents.send('overlay:show')
}

export function hideOverlay(): void {
  if (!overlayWindow) return
  overlayWindow.webContents.send('overlay:hide')
  overlayWindow.hide()
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}
