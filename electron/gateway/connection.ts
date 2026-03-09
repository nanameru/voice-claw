import WebSocket from 'ws'
import crypto from 'crypto'
import path from 'path'
import { readFileSync } from 'fs'
import { app } from 'electron'
import os from 'os'
import { logger } from '../utils/logger'
import { BrowserWindow } from 'electron'
import store from '../utils/store'
import {
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  publicKeyRawBase64UrlFromPem,
  buildDeviceAuthPayload,
  type DeviceIdentity,
} from '../utils/device-identity'

let ws: any = null
let reconnectTimer: NodeJS.Timeout | null = null
let connected = false
let deviceIdentity: DeviceIdentity | null = null
let currentWindow: BrowserWindow | null = null
let gatewayToken: string = ''

// Safe IPC send - prevents "Object has been destroyed" crash
function safeSend(channel: string, ...args: unknown[]): void {
  try {
    if (currentWindow && !currentWindow.isDestroyed()) {
      const wc = currentWindow.webContents
      if (wc && !wc.isDestroyed()) {
        wc.send(channel, ...args)
      }
    }
  } catch (e) {
    logger.error('safeSend error (ignored):', e)
  }
}

const CLIENT_ID = 'gateway-client'
const CLIENT_MODE = 'ui'
const ROLE = 'operator'
const SCOPES = ['operator.admin']

export function getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
  if (!ws) return 'disconnected'
  if (connected) return 'connected'
  if (ws.readyState === 0) return 'connecting'
  return 'disconnected'
}

function loadGatewayToken(): string {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const token = config?.gateway?.auth?.token
    if (token) {
      logger.info('Gateway token loaded from ~/.openclaw/openclaw.json')
      return token
    }
  } catch { /* no config file */ }
  return ''
}

async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  if (deviceIdentity) return deviceIdentity
  const identityPath = path.join(app.getPath('userData'), 'device-identity.json')
  deviceIdentity = await loadOrCreateDeviceIdentity(identityPath)
  logger.info(`Device ID: ${deviceIdentity.deviceId.slice(0, 12)}...`)
  return deviceIdentity
}

function sendConnect(challengeNonce?: string): void {
  if (!ws || !deviceIdentity) return

  const signedAtMs = Date.now()
  const nonce = challengeNonce || crypto.randomUUID()

  const payload = buildDeviceAuthPayload({
    deviceId: deviceIdentity.deviceId,
    clientId: CLIENT_ID,
    clientMode: CLIENT_MODE,
    role: ROLE,
    scopes: SCOPES,
    signedAtMs,
    token: gatewayToken,
    nonce,
  })
  const signature = signDevicePayload(deviceIdentity.privateKeyPem, payload)

  const device = {
    id: deviceIdentity.deviceId,
    publicKey: publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem),
    signature,
    signedAt: signedAtMs,
    nonce,
  }

  const handshake = {
    type: 'req',
    id: `connect-${Date.now()}`,
    method: 'connect',
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: CLIENT_ID,
        displayName: 'VoiceClaw',
        version: '0.1.0',
        platform: process.platform,
        mode: CLIENT_MODE,
      },
      auth: {
        token: gatewayToken,
      },
      caps: [],
      role: ROLE,
      scopes: SCOPES,
      device,
    },
  }

  ws.send(JSON.stringify(handshake))
}

export async function connectToGateway(window: BrowserWindow): Promise<void> {
  if (ws?.readyState === 1 && connected) return
  currentWindow = window

  await ensureDeviceIdentity()
  if (!gatewayToken) gatewayToken = loadGatewayToken()
  const { host, port } = store.get('gateway')

  // Security: Only allow localhost connections
  const allowedHosts = ['localhost', '127.0.0.1', '::1']
  if (!allowedHosts.includes(host)) {
    logger.error(`Blocked connection to non-localhost host: ${host}`)
    throw new Error('Gateway connections are only allowed to localhost')
  }
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    logger.error(`Invalid gateway port: ${port}`)
    throw new Error('Invalid gateway port')
  }

  const url = `ws://${host}:${port}/ws`
  logger.info(`Connecting to gateway: ${url}`)

  try {
    ws = new WebSocket(url, {
      headers: { Origin: `http://${host}:${port}` },
    })

    ws.on('open', () => {
      logger.info('WebSocket open, waiting for connect.challenge...')
    })

    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString())
        logger.info(`Gateway recv: type=${message.type} ${message.event || message.method || message.id || ''} ok=${message.ok ?? ''}`)

        if (message.type === 'event' && message.event === 'connect.challenge') {
          const challengeNonce = message.payload?.nonce
          logger.info('Received challenge, re-signing with server nonce')
          sendConnect(challengeNonce)
          return
        }

        if (message.type === 'res' && message.id?.startsWith('connect-')) {
          if (message.ok) {
            connected = true
            logger.info('Gateway handshake successful!')
            safeSend('gateway:status', 'connected')
            if (reconnectTimer) {
              clearTimeout(reconnectTimer)
              reconnectTimer = null
            }
          } else {
            logger.error('Gateway handshake failed:', message.error || message)
            safeSend('gateway:status', 'disconnected')
          }
          return
        }

        if (message.type === 'res') {
          safeSend('gateway:message', {
            id: message.id,
            result: message.payload,
            ok: message.ok,
          })
          return
        }

        if (message.type === 'event') {
          // Log agent events payload for debugging
          if (message.event === 'agent') {
            const p = message.payload || {}
            logger.info(`  agent event: stream=${p.stream} keys=${Object.keys(p).join(',')} data_keys=${p.data ? Object.keys(p.data).join(',') : 'none'}`)
            logger.info(`  agent data: ${JSON.stringify(p.data || {}).slice(0, 200)}`)
          }
          safeSend('gateway:event', {
            event: message.event,
            payload: message.payload,
          })
          return
        }

        safeSend('gateway:message', message)
      } catch (e) {
        logger.error('Failed to parse gateway message:', e)
      }
    })

    ws.on('close', () => {
      logger.info('Gateway disconnected')
      connected = false
      safeSend('gateway:status', 'disconnected')
      ws = null
      scheduleReconnect()
    })

    ws.on('error', (err: Error) => {
      logger.error('Gateway error:', err.message)
      connected = false
      safeSend('gateway:status', 'disconnected')
    })
  } catch (err) {
    logger.error('Failed to create WebSocket connection:', err)
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  // Don't reconnect if window is destroyed
  if (!currentWindow || currentWindow.isDestroyed()) return

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (currentWindow && !currentWindow.isDestroyed()) {
      connectToGateway(currentWindow)
    }
  }, 5000)
}

export function sendToGateway(method: string, params: Record<string, unknown>): void {
  if (!ws || !connected) {
    logger.error('Gateway not connected, cannot send:', method)
    return
  }

  const message = {
    type: 'req',
    id: crypto.randomUUID(),
    method,
    params,
  }

  logger.info(`Sending to gateway: ${method} (id: ${message.id})`)
  ws.send(JSON.stringify(message))
}

export function disconnectGateway(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  connected = false
  if (ws) {
    // Remove all listeners before closing to prevent "Object has been destroyed"
    const oldWs = ws
    ws = null
    oldWs.removeAllListeners()
    oldWs.close()
  }
}
