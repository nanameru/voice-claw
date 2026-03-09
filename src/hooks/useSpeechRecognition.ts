import { useCallback, useEffect, useRef } from 'react'
import { useVoiceStore } from '../stores/voice'

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent {
  error: string
  message: string
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<any>(null)
  const {
    isListening,
    setListening,
    setTranscript,
    setInterimTranscript,
    appendTranscript,
    setError,
    setMicPermission,
  } = useVoiceStore()

  useEffect(() => {
    // Check mic permission on mount
    window.voiceClaw.mic.checkPermission().then((status) => {
      setMicPermission(status as any)
    })
  }, [setMicPermission])

  const startListening = useCallback(async () => {
    // Request mic permission
    const permission = await window.voiceClaw.mic.checkPermission()
    if (permission !== 'granted') {
      const granted = await window.voiceClaw.mic.requestPermission()
      if (!granted) {
        setError('Microphone permission denied')
        setMicPermission('denied')
        return
      }
      setMicPermission('granted')
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'ja-JP'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (final) {
        appendTranscript(final)
      }
      setInterimTranscript(interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== 'no-speech') {
        setError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
    setError(null)
  }, [setListening, appendTranscript, setInterimTranscript, setError, setMicPermission])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
  }, [setListening])

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }, [isListening, startListening, stopListening])

  return { startListening, stopListening, toggleListening }
}
