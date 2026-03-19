import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { screen, systemPreferences } from 'electron'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

export interface ScreenSnapshot {
  base64: string
  cursor: { x: number; y: number }
  timestamp: number
}

// ── Security: Rate limiting ─────────────────────────────
let lastCaptureTime = 0
const MIN_CAPTURE_INTERVAL_MS = 1500

// ── Security: Track temp files for cleanup on crash ─────
let activeTmpFile: string | null = null

/**
 * Check macOS Screen Recording permission status.
 */
export function getScreenPermissionStatus(): string {
  if (process.platform === 'darwin') {
    return systemPreferences.getMediaAccessStatus('screen')
  }
  return 'granted'
}

/**
 * Generate a cryptographically random temp file path.
 */
function secureTmpPath(): string {
  const randomName = crypto.randomBytes(16).toString('hex')
  return path.join(os.tmpdir(), `vc-${randomName}.png`)
}

/**
 * Capture a screenshot with cursor position.
 * Security: uses random temp filename, enforces rate limit, checks permissions.
 */
export async function captureScreenWithCursor(): Promise<ScreenSnapshot> {
  // Rate limit
  const now = Date.now()
  if (now - lastCaptureTime < MIN_CAPTURE_INTERVAL_MS) {
    throw new Error('Screenshot rate limit exceeded')
  }
  lastCaptureTime = now

  // Check Screen Recording permission
  const permStatus = getScreenPermissionStatus()
  if (permStatus === 'denied') {
    throw new Error('Screen Recording permission denied. Enable in System Settings > Privacy > Screen Recording.')
  }

  const tmpFile = secureTmpPath()
  activeTmpFile = tmpFile
  const cursor = screen.getCursorScreenPoint()

  try {
    // -x: silent, -t png: PNG format, -R: capture specific region could be added later
    await execFileAsync('screencapture', ['-x', '-t', 'png', tmpFile], {
      timeout: 5000,
    })

    const buffer = await fs.readFile(tmpFile)

    // Set restrictive permissions immediately after read
    try { await fs.chmod(tmpFile, 0o600) } catch { /* ignore */ }

    const base64 = buffer.toString('base64')
    const sizeKB = (buffer.length / 1024).toFixed(0)

    // Log only metadata, never the image data
    logger.info(`Screenshot captured: ${sizeKB}KB`)

    return { base64, cursor, timestamp: now }
  } catch (err) {
    logger.error('Screenshot capture failed:', err instanceof Error ? err.message : 'unknown')
    throw new Error(`Screenshot failed: ${err instanceof Error ? err.message : 'unknown'}`)
  } finally {
    // Always clean up temp file immediately
    activeTmpFile = null
    try { await fs.unlink(tmpFile) } catch { /* ignore */ }
  }
}

// ── Periodic capture during PTT ─────────────────────────
let captureTimer: ReturnType<typeof setInterval> | null = null
let snapshots: ScreenSnapshot[] = []
const MAX_SNAPSHOTS = 5  // Limit to 5 snapshots max (security: reduce data exposure)

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
    .catch((err) => logger.error('Periodic capture error:', err instanceof Error ? err.message : 'unknown'))

  captureTimer = setInterval(() => {
    if (snapshots.length >= MAX_SNAPSHOTS) return // Hard cap

    captureScreenWithCursor()
      .then((snap) => snapshots.push(snap))
      .catch((err) => logger.error('Periodic capture error:', err instanceof Error ? err.message : 'unknown'))
  }, intervalMs)
}

/**
 * Stop periodic capture and return all collected snapshots.
 * Clears internal buffer immediately.
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

/**
 * Emergency cleanup — call on app quit to ensure no temp files remain.
 */
export function cleanupScreenshots(): void {
  stopPeriodicCapture()
  if (activeTmpFile) {
    try {
      require('fs').unlinkSync(activeTmpFile)
    } catch { /* ignore */ }
    activeTmpFile = null
  }
}
