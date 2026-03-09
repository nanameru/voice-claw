import { ipcMain } from 'electron'
import { getSecureValue } from '../utils/store'
import { logger } from '../utils/logger'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'

/**
 * Transcribe audio buffer using OpenAI Whisper API.
 * Receives a raw audio buffer (webm/opus from MediaRecorder) and returns text.
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const apiKey = getSecureValue('whisperApiKey')
  if (!apiKey) {
    throw new Error('Whisper API key not configured. Set it in Settings.')
  }

  // Build multipart/form-data manually to avoid external dependencies
  const boundary = `----VoiceClawBoundary${Date.now()}`
  const CRLF = '\r\n'

  const preamble = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="recording.webm"`,
    `Content-Type: audio/webm`,
    '',
    '',
  ].join(CRLF)

  const modelPart = [
    '',
    `--${boundary}`,
    `Content-Disposition: form-data; name="model"`,
    '',
    'whisper-1',
    `--${boundary}--`,
    '',
  ].join(CRLF)

  const preambleBuffer = Buffer.from(preamble, 'utf-8')
  const modelBuffer = Buffer.from(modelPart, 'utf-8')
  const body = Buffer.concat([preambleBuffer, audioBuffer, modelBuffer])

  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`Whisper API error (${response.status}): ${errorText}`)
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`)
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
