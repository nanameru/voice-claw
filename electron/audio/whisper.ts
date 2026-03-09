import { ipcMain } from 'electron'
import { getSecureValue } from '../utils/store'
import store from '../utils/store'
import { logger } from '../utils/logger'

const STT_ENDPOINTS: Record<string, { url: string; model: string }> = {
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3',
  },
}

/**
 * Transcribe audio buffer using Whisper API (OpenAI or Groq).
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const apiKey = getSecureValue('whisperApiKey')
  if (!apiKey) {
    throw new Error('API key not configured. Set it in Settings.')
  }

  const provider = store.get('audio.sttProvider') || 'groq'
  const endpoint = STT_ENDPOINTS[provider] || STT_ENDPOINTS.groq

  logger.info(`STT provider: ${provider}, model: ${endpoint.model}`)

  // Build multipart/form-data manually to avoid external dependencies
  const boundary = `----VoiceClawBoundary${Date.now()}`
  const CRLF = '\r\n'

  const parts: Buffer[] = []

  // file part
  parts.push(Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="file"; filename="recording.webm"${CRLF}` +
    `Content-Type: audio/webm${CRLF}${CRLF}`,
    'utf-8'
  ))
  parts.push(audioBuffer)

  // model part
  parts.push(Buffer.from(
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
    endpoint.model,
    'utf-8'
  ))

  // language part (Japanese)
  parts.push(Buffer.from(
    `${CRLF}--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="language"${CRLF}${CRLF}` +
    'ja',
    'utf-8'
  ))

  // closing boundary
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8'))

  const body = Buffer.concat(parts)

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`STT API error (${response.status}): ${errorText}`)
    throw new Error(`STT API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json() as { text: string }
  return result.text || ''
}

/**
 * Register the audio:transcribe IPC handler.
 */
export function setupAudioHandlers(): void {
  ipcMain.handle('audio:transcribe', async (_event, audioData: ArrayBuffer) => {
    if (!audioData || !(audioData instanceof ArrayBuffer || Buffer.isBuffer(audioData))) {
      throw new Error('Invalid audio data: expected ArrayBuffer or Buffer')
    }

    const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData)

    if (buffer.length === 0) {
      throw new Error('Empty audio data')
    }

    // Limit audio size to 25MB (Whisper API limit)
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error('Audio data exceeds 25MB limit')
    }

    logger.info(`Transcribing audio: ${buffer.length} bytes`)
    const text = await transcribeAudio(buffer)
    logger.info(`Transcription result: "${text.substring(0, 100)}..."`)
    return text
  })
}
