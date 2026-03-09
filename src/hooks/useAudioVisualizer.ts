import { useCallback, useEffect, useRef, useState } from 'react'

export function useAudioVisualizer() {
  const [audioData, setAudioData] = useState<number[]>(new Array(32).fill(0))
  const [volume, setVolume] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number>(0)
  const streamRef = useRef<MediaStream | null>(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64
      analyserRef.current = analyser

      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateData = () => {
        analyser.getByteFrequencyData(dataArray)

        const normalized = Array.from(dataArray).map((v) => v / 255)
        setAudioData(normalized)

        // Calculate average volume
        const avg = normalized.reduce((sum, v) => sum + v, 0) / normalized.length
        setVolume(avg)

        animationRef.current = requestAnimationFrame(updateData)
      }

      updateData()
    } catch (err) {
      console.error('Audio visualizer error:', err)
    }
  }, [])

  const stop = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setAudioData(new Array(32).fill(0))
    setVolume(0)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { audioData, volume, start, stop }
}
