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
function secureTmpPath(ext = 'jpg'): string {
  const randomName = crypto.randomBytes(16).toString('hex')
  return path.join(os.tmpdir(), `vc-${randomName}.${ext}`)
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

  const tmpFile = secureTmpPath('jpg')
  activeTmpFile = tmpFile
  const cursor = screen.getCursorScreenPoint()

  try {
    // Capture as JPEG for smaller file size (~200-500KB vs 3-5MB PNG)
    // Gateway has a 5MB attachment limit; Retina PNGs often exceed this
    await execFileAsync('screencapture', ['-x', '-t', 'jpg', tmpFile], {
      timeout: 5000,
    })

    // Resize to max 1920px width to keep under 5MB limit for Gateway
    try {
      await execFileAsync('sips', [
        '--resampleWidth', '1920',
        '--setProperty', 'formatOptions', '70',
        tmpFile,
      ], { timeout: 5000 })
    } catch {
      // sips resize failed — continue with original capture
    }

    const buffer = await fs.readFile(tmpFile)

    // Set restrictive permissions immediately after read
    try { await fs.chmod(tmpFile, 0o600) } catch { /* ignore */ }

    const base64 = buffer.toString('base64')
    const sizeKB = (buffer.length / 1024).toFixed(0)

    // Log only metadata, never the image data
    logger.info(`Screenshot captured: ${sizeKB}KB (JPEG)`)

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
let pendingCapture: Promise<void> | null = null
const MAX_SNAPSHOTS = 5  // Limit to 5 snapshots max (security: reduce data exposure)

/**
 * Run a single capture and track the pending promise.
 */
function doCapture(): void {
  const promise = captureScreenWithCursor()
    .then((snap) => {
      snapshots.push(snap)
      logger.info(`Snapshot collected: ${snapshots.length} total`)
    })
    .catch((err) => logger.error('Periodic capture error:', err instanceof Error ? err.message : 'unknown'))
    .finally(() => {
      if (pendingCapture === promise) pendingCapture = null
    })
  pendingCapture = promise
}

/**
 * Start periodic screenshot capture (every intervalMs).
 * First capture is immediate.
 */
export function startPeriodicCapture(intervalMs = 2000): void {
  stopPeriodicCaptureSync()
  snapshots = []

  // Immediate first capture
  doCapture()

  captureTimer = setInterval(() => {
    if (snapshots.length >= MAX_SNAPSHOTS) return // Hard cap
    doCapture()
  }, intervalMs)
}

/**
 * Stop periodic capture (sync) — does NOT wait for pending captures.
 */
function stopPeriodicCaptureSync(): void {
  if (captureTimer) {
    clearInterval(captureTimer)
    captureTimer = null
  }
}

/**
 * Stop periodic capture and return all collected snapshots.
 * WAITS for any in-progress capture to complete before returning.
 */
export async function stopPeriodicCapture(): Promise<ScreenSnapshot[]> {
  stopPeriodicCaptureSync()

  // Wait for any in-progress capture to finish
  if (pendingCapture) {
    logger.info('Waiting for pending screenshot capture to complete...')
    await pendingCapture
  }

  const result = [...snapshots]
  snapshots = []
  logger.info(`stopPeriodicCapture: returning ${result.length} snapshots`)
  return result
}

/**
 * Emergency cleanup — call on app quit to ensure no temp files remain.
 */
export function cleanupScreenshots(): void {
  stopPeriodicCaptureSync()
  snapshots = []
  if (activeTmpFile) {
    try {
      require('fs').unlinkSync(activeTmpFile)
    } catch { /* ignore */ }
    activeTmpFile = null
  }
}
