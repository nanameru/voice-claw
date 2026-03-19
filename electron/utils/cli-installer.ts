/**
 * OpenClaw CLI Installer
 *
 * Checks for existing openclaw binary, installs via the official install script,
 * and streams JSON progress events back to the caller.
 */
import { spawn, execFileSync } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'
import { logger } from './logger'

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface InstallProgress {
  event: 'status' | 'done' | 'error'
  message: string
  version?: string
  path?: string
}

// ────────────────────────────────────────────────────────
// Binary discovery (shared with gateway/process.ts)
// ────────────────────────────────────────────────────────

export function findOpenClawBinary(): string | null {
  const candidates = [
    '/opt/homebrew/bin/openclaw',
    '/usr/local/bin/openclaw',
    path.join(os.homedir(), '.local', 'bin', 'openclaw'),
    path.join(os.homedir(), '.openclaw', 'bin', 'openclaw'),
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  // Try PATH via which/where (using execFileSync to avoid shell injection)
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const result = execFileSync(cmd, ['openclaw'], {
      encoding: 'utf8',
      timeout: 3000,
    }).trim()
    if (result && existsSync(result.split('\n')[0])) {
      return result.split('\n')[0]
    }
  } catch {
    /* not found */
  }

  return null
}

// ────────────────────────────────────────────────────────
// Version detection
// ────────────────────────────────────────────────────────

export function getOpenClawVersion(binaryPath: string): string | null {
  try {
    const output = execFileSync(binaryPath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim()
    // Parse version from output like "openclaw 1.2.3" or just "1.2.3"
    const match = output.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : output
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────
// CLI installer
// ────────────────────────────────────────────────────────

export async function installOpenClawCLI(
  onProgress: (progress: InstallProgress) => void,
): Promise<{
  success: boolean
  path?: string
  version?: string
  error?: string
}> {
  const prefix = path.join(os.homedir(), '.openclaw')

  onProgress({ event: 'status', message: 'OpenClaw CLIをインストール中...' })

  return new Promise((resolve) => {
    const script = `curl -fsSL https://openclaw.bot/install-cli.sh | bash -s -- --json --no-onboard --prefix '${prefix}'`

    const child = spawn('/bin/bash', ['-lc', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 900_000, // 15 min timeout (matches ClawX)
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text

      // Parse JSON lines emitted by the install script
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed) as {
            event: string
            version?: string
            message?: string
          }
          onProgress({
            event: event.event as 'status' | 'done' | 'error',
            message: event.message || event.event,
            version: event.version,
          })
        } catch {
          // Not JSON — log as plain text
          logger.info(`[CLI Install] ${trimmed}`)
        }
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      onProgress({
        event: 'error',
        message: `インストールエラー: ${err.message}`,
      })
      resolve({ success: false, error: err.message })
    })

    child.on('exit', (code) => {
      if (code === 0) {
        const installedPath = findOpenClawBinary()
        const version = installedPath
          ? getOpenClawVersion(installedPath) ?? undefined
          : undefined

        onProgress({
          event: 'done',
          message: version
            ? `OpenClaw ${version} をインストールしました`
            : 'OpenClaw をインストールしました',
          version,
          path: installedPath ?? undefined,
        })
        resolve({
          success: true,
          path: installedPath ?? undefined,
          version,
        })
      } else {
        const errMsg = stderr.trim() || `exit code ${code}`
        onProgress({
          event: 'error',
          message: `インストール失敗: ${errMsg}`,
        })
        resolve({ success: false, error: errMsg })
      }
    })
  })
}
