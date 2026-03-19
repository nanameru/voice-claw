import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { logger } from './logger'

const execFileAsync = promisify(execFile)

/**
 * Capture a screenshot using macOS screencapture command.
 * Returns base64-encoded PNG data.
 */
export async function captureScreen(): Promise<string> {
  const tmpFile = path.join(os.tmpdir(), `voiceclaw-screenshot-${Date.now()}.png`)

  try {
    // -x: silent (no shutter sound), -t png: PNG format
    await execFileAsync('screencapture', ['-x', '-t', 'png', tmpFile], {
      timeout: 5000,
    })

    const buffer = await fs.readFile(tmpFile)
    const base64 = buffer.toString('base64')

    logger.info(`Screenshot captured: ${(buffer.length / 1024).toFixed(0)}KB`)
    return base64
  } catch (err) {
    logger.error('Screenshot capture failed:', err)
    throw new Error(`Screenshot failed: ${err instanceof Error ? err.message : 'unknown'}`)
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tmpFile)
    } catch { /* ignore */ }
  }
}
