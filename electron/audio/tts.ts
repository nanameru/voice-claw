import { ipcMain } from 'electron'
import { getSecureValue } from '../utils/store'
import store from '../utils/store'
import { logger } from '../utils/logger'

/**
 * Generate a short voice acknowledgment using OpenAI Chat Completions API.
 */
async function generateVoiceAcknowledgment(userMessage: string): Promise<string> {
  const apiKey = getSecureValue('ttsApiKey')
  if (!apiKey) {
    throw new Error('TTS API key not configured. Set it in Settings.')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'あなたは音声アシスタントです。ユーザーの音声コマンドに対して、短い口語的な日本語の応答のみ返してください（1〜2文以内）。' +
            'タスクを実行する必要はありません。自然な確認の応答だけを返してください。' +
            '例：「はい、今からやりますね！」「了解です、少々お待ちください」「わかりました！」',
        },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`Chat Completions API error (${response.status}): ${errorText}`)
    throw new Error(`Chat Completions API error: ${response.status}`)
  }

  const result = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  return result.choices[0]?.message?.content || ''
}

/**
 * Synthesize speech from text using OpenAI TTS API.
 */
async function synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
  const apiKey = getSecureValue('ttsApiKey')
  if (!apiKey) {
    throw new Error('TTS API key not configured. Set it in Settings.')
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice || 'nova',
      response_format: 'mp3',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`TTS API error (${response.status}): ${errorText}`)
    throw new Error(`TTS API error: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Register TTS IPC handlers.
 */
export function setupTtsHandlers(): void {
  // Full pipeline: generate acknowledgment text + synthesize speech
  ipcMain.handle('tts:speak', async (_event, message: string) => {
    if (typeof message !== 'string' || !message.trim()) {
      throw new Error('Invalid message: expected non-empty string')
    }
    if (message.length > 4096) {
      throw new Error('Message too long: max 4096 characters')
    }

    const voice = (store.get('tts.voice' as any) as string) || 'nova'

    logger.info(`TTS speak: generating acknowledgment for "${message.substring(0, 50)}..."`)
    const acknowledgment = await generateVoiceAcknowledgment(message)
    logger.info(`TTS acknowledgment: "${acknowledgment}"`)

    const audioBuffer = await synthesizeSpeech(acknowledgment, voice)
    logger.info(`TTS audio: ${audioBuffer.length} bytes`)

    return audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    )
  })

  // Synthesize speech from provided text only (no LLM call)
  ipcMain.handle('tts:synthesize', async (_event, text: string) => {
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Invalid text: expected non-empty string')
    }
    if (text.length > 4096) {
      throw new Error('Text too long: max 4096 characters')
    }

    const voice = (store.get('tts.voice' as any) as string) || 'nova'

    logger.info(`TTS synthesize: "${text.substring(0, 50)}..."`)
    const audioBuffer = await synthesizeSpeech(text, voice)
    logger.info(`TTS audio: ${audioBuffer.length} bytes`)

    return audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength,
    )
  })
}
