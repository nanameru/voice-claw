import { BrowserWindow, screen, shell } from 'electron'
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
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // In dev mode, don't hide on blur so DevTools can be used
  if (!process.env.VITE_DEV_SERVER_URL) {
    overlayWindow.on('blur', () => {
      hideOverlay()
    })
  }

  // Prevent navigation to external URLs
  overlayWindow.webContents.on('will-navigate', (e) => {
    e.preventDefault()
  })

  // Redirect external link clicks to system browser (with URL scheme validation)
  overlayWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (['https:', 'http:'].includes(parsed.protocol)) {
        shell.openExternal(url)
      }
    } catch { /* invalid URL, ignore */ }
    return { action: 'deny' }
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
