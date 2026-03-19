import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { screen } from 'electron'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

export interface ScreenSnapshot {
  base64: string
  cursor: { x: number; y: number }
  timestamp: number
}

/**
 * Capture a screenshot with cursor position.
 */
export async function captureScreenWithCursor(): Promise<ScreenSnapshot> {
  const tmpFile = path.join(os.tmpdir(), `voiceclaw-screenshot-${Date.now()}.png`)
  const cursor = screen.getCursorScreenPoint()

  try {
    await execFileAsync('screencapture', ['-x', '-t', 'png', tmpFile], {
      timeout: 5000,
    })

    const buffer = await fs.readFile(tmpFile)
    const base64 = buffer.toString('base64')

    logger.info(`Screenshot captured: ${(buffer.length / 1024).toFixed(0)}KB, cursor=(${cursor.x},${cursor.y})`)
    return { base64, cursor, timestamp: Date.now() }
  } catch (err) {
    logger.error('Screenshot capture failed:', err)
    throw new Error(`Screenshot failed: ${err instanceof Error ? err.message : 'unknown'}`)
  } finally {
    try { await fs.unlink(tmpFile) } catch { /* ignore */ }
  }
}

// ── Periodic capture during PTT ─────────────────────────
let captureTimer: ReturnType<typeof setInterval> | null = null
let snapshots: ScreenSnapshot[] = []

/**
 * Start periodic screenshot capture (every intervalMs).
 * First capture is immediate.
 */
export function startPeriodicCapture(intervalMs = 2000): void {
  stopPeriodicCapture()
  snapshots = []

  // Immediate first capture
  captureScreenWithCursor()
    .then((snap) => snapshots.push(snap))
    .catch((err) => logger.error('Periodic capture error:', err))

  captureTimer = setInterval(() => {
    captureScreenWithCursor()
      .then((snap) => {
        snapshots.push(snap)
        // Keep max 10 snapshots to limit memory
        if (snapshots.length > 10) {
          snapshots.shift()
        }
      })
      .catch((err) => logger.error('Periodic capture error:', err))
  }, intervalMs)
}

/**
 * Stop periodic capture and return all collected snapshots.
 */
export function stopPeriodicCapture(): ScreenSnapshot[] {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
  const result = [...snapshots]
  snapshots = []
  return result
}
