import { Tray, Menu, nativeImage, app } from 'electron'
import { showOverlay } from './overlay-window'
import { getConnectionStatus } from '../gateway/connection'

let tray: Tray | null = null

export function createTray(): void {
  // Create a simple 16x16 tray icon
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADKSURBVDiNpZMxCsJAEEX/bGIhWHkAr+BVPIKdjY2NZ/AuXsHKxsLGG1hYiWJhYbObsJtkieMwsMPO8P7+7OwCf6oMqDWkLqAFnL3fOPUhPwH0gCPwAGbAyidgGOgjPwI1xJpK6gaqknrurSwBJ+DOJ3QAjLxfi8p/gYbUI/Wkni2oA6hHqmkSqSeqaZk7SwB9QkfASuqJ+kD7APWBG3DxPm3grIwLgP7fwN2AngNmwMUbJWD2X9wIXUAt0SnbD/kKOAXuAd6BaQvUJY+/GwAAAABJRU5ErkJggg==',
      'base64'
    )
  )

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('VoiceClaw')

  updateTrayMenu()
}

export function updateTrayMenu(): void {
  if (!tray) return

  const status = getConnectionStatus()
  const statusLabel = status === 'connected' ? '● Connected' : '○ Disconnected'

  const contextMenu = Menu.buildFromTemplate([
    { label: 'VoiceClaw', enabled: false },
    { type: 'separator' },
    { label: `Gateway: ${statusLabel}`, enabled: false },
    { type: 'separator' },
    { label: 'Show Overlay', click: showOverlay },
    { label: 'Settings', click: () => showOverlay() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
}
