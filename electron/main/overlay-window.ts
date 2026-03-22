import { BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let overlayWindow: BrowserWindow | null = null
let isPTTMode = false
let baseHeight = 64

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight } = display.workAreaSize

  const windowWidth = Math.round(screenWidth * 0.85)
  baseHeight = 64

  overlayWindow = new BrowserWindow({
    width: windowWidth,
    height: baseHeight,
    x: Math.round((screenWidth - windowWidth) / 2),
    y: screenHeight - baseHeight - 12,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
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
  // In PTT mode, also don't hide on blur (controlled by isPTTMode flag)
  overlayWindow.on('blur', () => {
    if (!process.env.VITE_DEV_SERVER_URL && !isPTTMode) {
      hideOverlay()
    }
  })

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

/** Safe IPC send — prevents crash when render frame is disposed (e.g. during HMR) */
function safeSendToOverlay(channel: string, ...args: unknown[]): void {
  try {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const wc = overlayWindow.webContents
      if (wc && !wc.isDestroyed()) {
        wc.send(channel, ...args)
      }
    }
  } catch {
    // Ignore — render frame may be mid-reload
  }
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.show()
  overlayWindow.focus()
  safeSendToOverlay('overlay:show')
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  isPTTMode = false
  safeSendToOverlay('overlay:hide')
  overlayWindow.hide()
  // Reset to base height
  resizeOverlayHeight(baseHeight)
}

/**
 * Resize overlay height (expands upward from bottom).
 */
export function resizeOverlayHeight(height: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  const display = screen.getPrimaryDisplay()
  const { height: screenHeight } = display.workAreaSize
  const [width] = overlayWindow.getSize()

  const clampedHeight = Math.max(baseHeight, Math.min(height, 400))
  const y = screenHeight - clampedHeight - 12

  overlayWindow.setBounds({
    x: overlayWindow.getBounds().x,
    y,
    width,
    height: clampedHeight,
  })
}

/**
 * Start PTT mode: show overlay, send ptt:start to renderer, disable blur-hide.
 */
export function startPTT(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  isPTTMode = true
  showOverlay()
  safeSendToOverlay('ptt:start')
}

/**
 * Stop PTT mode (called when key released or from renderer).
 */
export function stopPTT(): void {
  isPTTMode = false
}

/**
 * Check if PTT mode is currently active.
 */
export function isPTTActive(): boolean {
  return isPTTMode
}

/**
 * Move overlay window by delta (for drag support).
 */
export function moveOverlay(deltaX: number, deltaY: number): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  const bounds = overlayWindow.getBounds()
  overlayWindow.setBounds({
    x: bounds.x + deltaX,
    y: bounds.y + deltaY,
    width: bounds.width,
    height: bounds.height,
  })
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}
