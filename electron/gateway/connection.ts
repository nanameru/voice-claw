import WebSocket from 'ws'
import { logger } from '../utils/logger'
import { BrowserWindow } from 'electron'
import store from '../utils/store'

let ws: any = null
let reconnectTimer: NodeJS.Timeout | null = null
let requestId = 0

export function getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
  if (!ws) return 'disconnected'
  if (ws.readyState === 1) return 'connected'
  if (ws.readyState === 0) return 'connecting'
  return 'disconnected'
}

export function connectToGateway(window: BrowserWindow): void {
  if (ws?.readyState === 1) return

  const { host, port } = store.get('gateway')
  const url = `ws://${host}:${port}`
  logger.info(`Connecting to gateway: ${url}`)

  try {
    ws = new WebSocket(url)

    ws.on('open', () => {
      logger.info('Gateway connected')
      window.webContents.send('gateway:status', 'connected')
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    })

    ws.on('message', (data: any) => {
      try {
        const message = JSON.parse(data.toString())
        window.webContents.send('gateway:message', message)
      } catch (e) {
        logger.error('Failed to parse gateway message:', e)
      }
    })

    ws.on('close', () => {
      logger.info('Gateway disconnected')
      window.webContents.send('gateway:status', 'disconnected')
      ws = null
      scheduleReconnect(window)
    })

    ws.on('error', (err: Error) => {
      logger.error('Gateway error:', err.message)
      window.webContents.send('gateway:status', 'disconnected')
    })
  } catch (err) {
    logger.error('Failed to create WebSocket connection:', err)
    scheduleReconnect(window)
  }
}

function scheduleReconnect(window: BrowserWindow): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectToGateway(window)
  }, 5000)
}

export function sendToGateway(method: string, params: Record<string, unknown>): void {
  if (!ws || ws.readyState !== 1) {
    logger.error('Gateway not connected')
    return
  }

  const message = {
    jsonrpc: '2.0',
    id: ++requestId,
    method,
    params,
  }

  ws.send(JSON.stringify(message))
}

export function disconnectGateway(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
}
