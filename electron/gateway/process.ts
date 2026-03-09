/**
 * OpenClaw Gateway Process Manager
 *
 * Based on ClawX's GatewayManager implementation.
 * Starts, monitors, reconnects, and stops the OpenClaw Gateway process.
 * VoiceClaw can run standalone without ClawX.
 */
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import crypto from 'crypto'
import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import store from '../utils/store'

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export type GatewayLifecycleState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'reconnecting'
  | 'error'

export interface GatewayStatus {
  state: GatewayLifecycleState
  port: number
  pid?: number
  uptime?: number
  error?: string
  connectedAt?: number
  version?: string
  reconnectAttempts?: number
}

interface ReconnectConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
}

export interface GatewayManagerEvents {
  status: (status: GatewayStatus) => void
  exit: (code: number | null) => void
  error: (error: Error) => void
}

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────

const DEFAULT_PORT = 18789

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  baseDelay: 1000,
  maxDelay: 30000,
}

const OPENCLAW_CONFIG_DIR = path.join(os.homedir(), '.openclaw')
const OPENCLAW_CONFIG_PATH = path.join(OPENCLAW_CONFIG_DIR, 'openclaw.json')

const MAX_START_ATTEMPTS = 3
const READY_CHECK_RETRIES = 60  // 60 × 500ms = 30s max
const READY_CHECK_INTERVAL = 500
const HEALTH_CHECK_INTERVAL = 30000
const PROCESS_KILL_TIMEOUT = 5000

// ────────────────────────────────────────────────────────
// Config helpers
// ────────────────────────────────────────────────────────

function readOpenClawJson(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeOpenClawJson(config: Record<string, unknown>): void {
  if (!existsSync(OPENCLAW_CONFIG_DIR)) {
    mkdirSync(OPENCLAW_CONFIG_DIR, { recursive: true })
  }
  // Ensure SIGUSR1 graceful reload is authorized
  const commands = (
    config.commands && typeof config.commands === 'object'
      ? { ...(config.commands as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  commands.restart = true
  config.commands = commands

  writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
}

function syncGatewayTokenToConfig(token: string): void {
  const config = readOpenClawJson()

  const gateway = (
    config.gateway && typeof config.gateway === 'object'
      ? { ...(config.gateway as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>

  const auth = (
    gateway.auth && typeof gateway.auth === 'object'
      ? { ...(gateway.auth as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>

  auth.mode = 'token'
  auth.token = token
  gateway.auth = auth
  if (!gateway.mode) gateway.mode = 'local'
  config.gateway = gateway

  writeOpenClawJson(config)
  logger.info('Synced gateway token to openclaw.json')
}

function sanitizeOpenClawConfig(): void {
  const config = readOpenClawJson()
  let modified = false

  // Remove misplaced keys in skills section
  const skills = config.skills
  if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
    const skillsObj = skills as Record<string, unknown>
    for (const key of ['enabled', 'disabled']) {
      if (key in skillsObj) {
        logger.info(`[sanitize] Removing misplaced key "skills.${key}" from openclaw.json`)
        delete skillsObj[key]
        modified = true
      }
    }
  }

  // Ensure commands.restart is enabled
  const commands = (
    config.commands && typeof config.commands === 'object'
      ? { ...(config.commands as Record<string, unknown>) }
      : {}
  ) as Record<string, unknown>
  if (commands.restart !== true) {
    commands.restart = true
    config.commands = commands
    modified = true
  }

  if (modified) {
    writeOpenClawJson(config)
    logger.info('[sanitize] openclaw.json sanitized')
  }
}

function getOrCreateGatewayToken(): string {
  // 1. Check existing token in openclaw.json
  const config = readOpenClawJson()
  const existing = (config?.gateway as any)?.auth?.token
  if (existing && typeof existing === 'string') return existing

  // 2. Generate new token
  const token = `voiceclaw-${crypto.randomBytes(16).toString('hex')}`
  syncGatewayTokenToConfig(token)
  logger.info('Generated new gateway token')
  return token
}

// ────────────────────────────────────────────────────────
// Binary discovery
// ────────────────────────────────────────────────────────

function findOpenClawBinary(): string | null {
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
    const result = execFileSync(cmd, ['openclaw'], { encoding: 'utf8', timeout: 3000 }).trim()
    if (result && existsSync(result.split('\n')[0])) return result.split('\n')[0]
  } catch { /* not found */ }

  return null
}

// ────────────────────────────────────────────────────────
// Port / process helpers
// ────────────────────────────────────────────────────────

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(true))
    server.once('listening', () => {
      server.close(() => resolve(false))
    })
    server.listen(port, '127.0.0.1')
  })
}

function testGatewayAlive(port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`ws://localhost:${port}/ws`, {
        headers: { Origin: `http://localhost:${port}` },
      })
      const timer = setTimeout(() => {
        try { ws.close() } catch { /* ignore */ }
        resolve(false)
      }, timeoutMs)

      ws.on('open', () => {
        clearTimeout(timer)
        try { ws.close() } catch { /* ignore */ }
        resolve(true)
      })
      ws.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

async function waitForPortFree(port: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const inUse = await isPortInUse(port)
    if (!inUse) return
    await new Promise((r) => setTimeout(r, 500))
  }
  logger.warn(`Port ${port} did not free within ${timeoutMs}ms`)
}

// ────────────────────────────────────────────────────────
// Orphan process detection & cleanup
// ────────────────────────────────────────────────────────

function validatePort(port: number): void {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}`)
  }
}

async function findExistingGatewayPid(port: number): Promise<number | null> {
  validatePort(port)
  try {
    if (process.platform === 'win32') {
      // Use execFileSync to avoid shell injection
      const output = execFileSync('netstat', ['-ano'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim()
      const lines = output.split('\n').filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'))
      if (lines.length > 0) {
        const parts = lines[0].trim().split(/\s+/)
        const pid = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(pid) && pid > 0) return pid
      }
    } else {
      // Use execFileSync with argument array to avoid shell injection
      const output = execFileSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN', '-t'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim()
      const pid = parseInt(output.split('\n')[0], 10)
      if (!isNaN(pid) && pid > 0) return pid
    }
  } catch { /* no process found */ }
  return null
}

async function killOrphanedProcess(port: number): Promise<boolean> {
  const pid = await findExistingGatewayPid(port)
  if (!pid) return false

  logger.warn(`Found orphaned process on port ${port} (pid=${pid}), killing...`)

  // On macOS, unload launchctl service to prevent auto-restart
  if (process.platform === 'darwin') {
    try {
      const uid = String(process.getuid?.() ?? '')
      if (uid) {
        spawnSync('launchctl', ['bootout', `gui/${uid}`, 'com.openclaw.gateway'], {
          encoding: 'utf8',
          timeout: 5000,
        })
      }
    } catch { /* ignore */ }
  }

  try {
    process.kill(pid, 'SIGTERM')
    // Wait for graceful shutdown
    await new Promise((r) => setTimeout(r, 2000))
    try {
      process.kill(pid, 0) // Check if still alive
      process.kill(pid, 'SIGKILL') // Force kill
      logger.info(`Force-killed orphaned process (pid=${pid})`)
    } catch {
      logger.info(`Orphaned process terminated gracefully (pid=${pid})`)
    }
    return true
  } catch {
    return false
  }
}

// ────────────────────────────────────────────────────────
// GatewayProcessManager
// ────────────────────────────────────────────────────────

export class GatewayProcessManager extends EventEmitter {
  private process: ChildProcess | null = null
  private processExitCode: number | null = null
  private ownsProcess = false

  private status: GatewayStatus = {
    state: 'stopped',
    port: DEFAULT_PORT,
  }

  private reconnectTimer: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private reconnectAttempts = 0
  private reconnectConfig: ReconnectConfig = { ...DEFAULT_RECONNECT_CONFIG }
  private shouldReconnect = true
  private startLock = false
  private lifecycleEpoch = 0
  private recentStartupStderrLines: string[] = []
  private restartInFlight: Promise<void> | null = null

  private gatewayToken: string = ''

  constructor() {
    super()
    const { port } = store.get('gateway')
    this.status.port = port
  }

  // ──── Public API ────────────────────────────────────

  getStatus(): GatewayStatus {
    return { ...this.status }
  }

  isRunning(): boolean {
    return this.status.state === 'running'
  }

  ownsGatewayProcess(): boolean {
    return this.ownsProcess && this.process !== null
  }

  // ──── Lifecycle: start ──────────────────────────────

  async start(): Promise<void> {
    if (this.startLock) {
      logger.debug('Gateway start ignored (already in progress)')
      return
    }

    if (this.status.state === 'running') {
      logger.debug('Gateway already running, skipping start')
      return
    }

    this.startLock = true
    const startEpoch = this.bumpLifecycleEpoch('start')
    logger.info(`Gateway start requested (port=${this.status.port})`)
    this.shouldReconnect = true

    // Cancel any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.reconnectAttempts = 0
    this.setStatus({ state: 'starting', reconnectAttempts: 0 })

    try {
      let startAttempts = 0

      while (true) {
        startAttempts++
        this.assertLifecycleEpoch(startEpoch, 'start')
        this.recentStartupStderrLines = []

        try {
          // 1. Check if Gateway is already running
          logger.debug('Checking for existing Gateway...')
          const portBusy = await isPortInUse(this.status.port)

          if (portBusy) {
            const alive = await testGatewayAlive(this.status.port)
            if (alive) {
              logger.info(`Existing Gateway found on port ${this.status.port}`)
              this.ownsProcess = false
              this.setStatus({
                state: 'running',
                connectedAt: Date.now(),
                pid: undefined,
              })
              this.startHealthCheck()
              return
            }

            // Port busy but gateway not responding — kill orphan
            logger.warn(`Port ${this.status.port} busy but gateway not responding`)
            await killOrphanedProcess(this.status.port)
            await waitForPortFree(this.status.port)
          }

          // 2. Start new Gateway process
          logger.debug('No existing Gateway found, starting new process...')

          // On Windows, wait for port to be free (TCP TIME_WAIT)
          if (process.platform === 'win32') {
            await waitForPortFree(this.status.port)
          }

          await this.startProcess()
          this.assertLifecycleEpoch(startEpoch, 'start/start-process')

          // 3. Wait for Gateway to be ready
          await this.waitForReady()
          this.assertLifecycleEpoch(startEpoch, 'start/wait-ready')

          // 4. Mark as running
          this.setStatus({
            state: 'running',
            connectedAt: Date.now(),
          })

          // 5. Start health monitoring
          this.startHealthCheck()
          logger.info('Gateway started successfully')
          return
        } catch (error) {
          if (this.isLifecycleSuperseded(startEpoch)) {
            logger.debug('Gateway start superseded by newer lifecycle event')
            return
          }

          const errMsg = String(error)
          const isTransient =
            errMsg.includes('ECONNREFUSED') ||
            errMsg.includes('Gateway process exited before becoming ready') ||
            errMsg.includes('Timed out')

          if (startAttempts < MAX_START_ATTEMPTS && isTransient) {
            logger.warn(`Transient start error: ${errMsg}. Retrying (${startAttempts}/${MAX_START_ATTEMPTS})...`)
            await new Promise((r) => setTimeout(r, 1000))
            continue
          }

          throw error
        }
      }
    } catch (error) {
      logger.error(`Gateway start failed (port=${this.status.port})`, error)
      this.setStatus({ state: 'error', error: String(error) })
      throw error
    } finally {
      this.startLock = false
    }
  }

  // ──── Lifecycle: stop ──────────────────────────────

  async stop(): Promise<void> {
    logger.info('Gateway stop requested')
    this.bumpLifecycleEpoch('stop')
    this.shouldReconnect = false
    this.clearAllTimers()

    // Kill our process
    if (this.process && this.ownsProcess) {
      const child = this.process
      const pid = child.pid

      await new Promise<void>((resolve) => {
        let exited = false

        child.once('exit', () => {
          exited = true
          resolve()
        })

        logger.info(`Sending SIGTERM to Gateway process (pid=${pid ?? 'unknown'})`)
        try { child.kill('SIGTERM') } catch { /* already dead */ }

        // Force kill after timeout
        const timeout = setTimeout(() => {
          if (!exited) {
            logger.warn(`Gateway did not exit in time, force-killing (pid=${pid ?? 'unknown'})`)
            if (pid) {
              try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
            }
          }
          resolve()
        }, PROCESS_KILL_TIMEOUT)

        child.once('exit', () => clearTimeout(timeout))
      })

      if (this.process === child) {
        this.process = null
      }
    }

    this.ownsProcess = false
    this.setStatus({
      state: 'stopped',
      error: undefined,
      pid: undefined,
      connectedAt: undefined,
      uptime: undefined,
    })
  }

  // ──── Lifecycle: restart ───────────────────────────

  async restart(): Promise<void> {
    if (this.restartInFlight) {
      logger.debug('Gateway restart already in progress, joining existing')
      await this.restartInFlight
      return
    }

    logger.info('Gateway restart requested')
    this.restartInFlight = (async () => {
      await this.stop()
      await this.start()
    })()

    try {
      await this.restartInFlight
    } finally {
      this.restartInFlight = null
    }
  }

  // ──── Private: startProcess ────────────────────────

  private async startProcess(): Promise<void> {
    const binary = findOpenClawBinary()
    if (!binary) {
      throw new Error(
        'OpenClaw binary not found. Install it first: npm i -g openclaw'
      )
    }

    // Get or create token and sync to config
    this.gatewayToken = getOrCreateGatewayToken()

    // Sanitize config before starting
    try {
      sanitizeOpenClawConfig()
    } catch (err) {
      logger.warn('Failed to sanitize openclaw.json:', err)
    }

    // Sync token to config
    try {
      syncGatewayTokenToConfig(this.gatewayToken)
    } catch (err) {
      logger.warn('Failed to sync gateway token:', err)
    }

    // Security: Token is passed ONLY via environment variable, NOT via CLI args
    // CLI args are visible to all users via `ps aux`
    const gatewayArgs = [
      'gateway',
      '--port', String(this.status.port),
      '--allow-unconfigured',
    ]

    // Build environment
    const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env
    const forkEnv: Record<string, string | undefined> = {
      ...baseEnv,
      OPENCLAW_GATEWAY_TOKEN: this.gatewayToken,
      OPENCLAW_NO_RESPAWN: '1',
      OPENCLAW_SKIP_CHANNELS: '',
    }

    logger.info(
      `Starting Gateway process (binary="${binary}", port=${this.status.port}, args="${gatewayArgs.join(' ')}")`
    )
    // Note: token is passed via OPENCLAW_GATEWAY_TOKEN env var only (not logged)

    return new Promise<void>((resolve, reject) => {
      this.processExitCode = null

      const child = spawn(binary, gatewayArgs, {
        cwd: OPENCLAW_CONFIG_DIR,
        env: forkEnv as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      this.process = child
      this.ownsProcess = true

      child.on('error', (error) => {
        this.ownsProcess = false
        logger.error('Gateway process spawn error:', error)
        reject(error)
      })

      child.on('exit', (code, signal) => {
        this.processExitCode = code
        const expectedExit = !this.shouldReconnect || this.status.state === 'stopped'
        logger.info(
          `Gateway process exited (code=${code}, signal=${signal}, expected=${expectedExit ? 'yes' : 'no'})`
        )
        this.ownsProcess = false

        if (this.process === child) {
          this.process = null
        }

        this.emit('exit', code)

        if (this.status.state === 'running' && !expectedExit) {
          this.setStatus({ state: 'stopped' })
          this.scheduleReconnect()
        }
      })

      // Log stdout
      child.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          logger.info(`[Gateway] ${trimmed}`)
        }
      })

      // Log stderr (filtered)
      child.stderr?.on('data', (data: Buffer) => {
        for (const line of data.toString().split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed) continue
          this.recentStartupStderrLines.push(trimmed)
          // Filter noisy warnings
          if (
            trimmed.includes('ExperimentalWarning') ||
            trimmed.includes('DeprecationWarning') ||
            trimmed.includes('punycode')
          ) continue
          logger.info(`[Gateway stderr] ${trimmed}`)
        }
      })

      // Process spawned
      if (child.pid) {
        logger.info(`Gateway process started (pid=${child.pid})`)
        this.setStatus({ pid: child.pid })
      }

      // Resolve immediately — waitForReady() will check if it's up
      resolve()
    })
  }

  // ──── Private: waitForReady ────────────────────────

  private async waitForReady(): Promise<void> {
    for (let i = 0; i < READY_CHECK_RETRIES; i++) {
      // Check if process exited early
      if (this.processExitCode !== null) {
        throw new Error(
          `Gateway process exited before becoming ready (code=${this.processExitCode})`
        )
      }

      const alive = await testGatewayAlive(this.status.port, 2000)
      if (alive) {
        logger.debug(`Gateway ready after ${i + 1} attempt(s)`)
        return
      }

      if (i > 0 && i % 10 === 0) {
        logger.debug(`Still waiting for Gateway... (attempt ${i + 1}/${READY_CHECK_RETRIES})`)
      }

      await new Promise((r) => setTimeout(r, READY_CHECK_INTERVAL))
    }

    throw new Error(
      `Gateway failed to become ready after ${READY_CHECK_RETRIES} attempts on port ${this.status.port}`
    )
  }

  // ──── Private: reconnect ───────────────────────────

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      logger.debug('Gateway reconnect skipped (auto-reconnect disabled)')
      return
    }

    if (this.reconnectTimer) return

    if (this.reconnectAttempts >= this.reconnectConfig.maxAttempts) {
      logger.error(
        `Gateway reconnect failed: max attempts reached (${this.reconnectConfig.maxAttempts})`
      )
      this.setStatus({
        state: 'error',
        error: 'Failed to reconnect after maximum attempts',
        reconnectAttempts: this.reconnectAttempts,
      })
      return
    }

    // Exponential backoff
    const delay = Math.min(
      this.reconnectConfig.baseDelay * Math.pow(2, this.reconnectAttempts),
      this.reconnectConfig.maxDelay
    )

    this.reconnectAttempts++
    logger.warn(
      `Scheduling Gateway reconnect attempt ${this.reconnectAttempts}/${this.reconnectConfig.maxAttempts} in ${delay}ms`
    )

    this.setStatus({
      state: 'reconnecting',
      reconnectAttempts: this.reconnectAttempts,
    })

    const scheduledEpoch = this.lifecycleEpoch

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null

      // Skip if lifecycle was superseded
      if (this.isLifecycleSuperseded(scheduledEpoch) || !this.shouldReconnect) {
        logger.debug('Skipping reconnect attempt (superseded or disabled)')
        return
      }

      try {
        await this.start()
        this.reconnectAttempts = 0
      } catch (error) {
        logger.error('Gateway reconnection attempt failed:', error)
        this.scheduleReconnect()
      }
    }, delay)
  }

  // ──── Private: health check ────────────────────────

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(async () => {
      if (this.status.state !== 'running') return

      const alive = await testGatewayAlive(this.status.port, 5000)
      if (!alive) {
        logger.warn('Gateway health check failed')
        this.setStatus({ state: 'stopped' })
        this.emit('error', new Error('Health check failed'))
        this.scheduleReconnect()
      }
    }, HEALTH_CHECK_INTERVAL)
  }

  // ──── Private: lifecycle epoch ─────────────────────

  private bumpLifecycleEpoch(reason: string): number {
    this.lifecycleEpoch++
    logger.debug(`Lifecycle epoch bumped to ${this.lifecycleEpoch} (${reason})`)
    return this.lifecycleEpoch
  }

  private assertLifecycleEpoch(expected: number, context: string): void {
    if (this.lifecycleEpoch !== expected) {
      throw new Error(`Lifecycle superseded at ${context} (expected=${expected}, current=${this.lifecycleEpoch})`)
    }
  }

  private isLifecycleSuperseded(epoch: number): boolean {
    return this.lifecycleEpoch !== epoch
  }

  // ──── Private: status & cleanup ────────────────────

  private setStatus(partial: Partial<GatewayStatus>): void {
    this.status = { ...this.status, ...partial }
    this.emit('status', { ...this.status })
  }

  private clearAllTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }
}

// ────────────────────────────────────────────────────────
// Singleton
// ────────────────────────────────────────────────────────

let instance: GatewayProcessManager | null = null

export function getGatewayProcessManager(): GatewayProcessManager {
  if (!instance) {
    instance = new GatewayProcessManager()
  }
  return instance
}
