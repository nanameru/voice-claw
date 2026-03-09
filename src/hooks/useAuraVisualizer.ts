import { useMemo, useRef, useEffect } from 'react'
import { useVoiceStore } from '../stores/voice'
import { useGatewayStore } from '../stores/gateway'

export type AuraState = 'idle' | 'listening' | 'thinking' | 'speaking'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(t, 1)
}

const STATE_PARAMS = {
  idle: {
    speed: 10,
    scale: 0.2,
    amplitude: 1.2,
    frequency: 0.4,
    bloom: 0.0,
    colorShift: 0.5,
    mix: 1.0,
  },
  listening: {
    speed: 20,
    scale: 0.3,
    amplitude: 1.0,
    frequency: 0.7,
    bloom: 0.2,
    colorShift: 0.5,
    mix: 1.5,
  },
  thinking: {
    speed: 30,
    scale: 0.3,
    amplitude: 0.5,
    frequency: 1.0,
    bloom: 0.3,
    colorShift: 0.8,
    mix: 1.5,
  },
  speaking: {
    speed: 70,
    scale: 0.2,
    amplitude: 0.75,
    frequency: 1.25,
    bloom: 0.4,
    colorShift: 0.6,
    mix: 1.5,
  },
}

export function useAuraVisualizer(volume: number) {
  const { isListening } = useVoiceStore()
  const { isStreaming } = useGatewayStore()

  const state: AuraState = useMemo(() => {
    if (isStreaming) return 'speaking'
    if (isListening) return 'listening'
    return 'idle'
  }, [isListening, isStreaming])

  // Smooth transition between states
  const currentRef = useRef({ ...STATE_PARAMS.idle })
  const targetParams = STATE_PARAMS[state]

  useEffect(() => {
    let animFrame: number
    const animate = () => {
      const c = currentRef.current
      const lerpSpeed = 0.05
      c.speed = lerp(c.speed, targetParams.speed, lerpSpeed)
      c.scale = lerp(c.scale, targetParams.scale, lerpSpeed)
      c.amplitude = lerp(c.amplitude, targetParams.amplitude, lerpSpeed)
      c.frequency = lerp(c.frequency, targetParams.frequency, lerpSpeed)
      c.bloom = lerp(c.bloom, targetParams.bloom, lerpSpeed)
      c.colorShift = lerp(c.colorShift, targetParams.colorShift, lerpSpeed)
      c.mix = lerp(c.mix, targetParams.mix, lerpSpeed)
      animFrame = requestAnimationFrame(animate)
    }
    animFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrame)
  }, [targetParams])

  const uniforms = useMemo(() => {
    const p = currentRef.current
    // Volume affects scale in speaking mode
    const volumeScale = state === 'speaking' ? volume * 0.2 : (state === 'listening' ? volume * 0.15 : 0)

    return {
      uSpeed: { value: p.speed },
      uBlur: { value: 1.0 },
      uScale: { value: p.scale + volumeScale },
      uShape: { value: 1.0 },
      uFrequency: { value: p.frequency },
      uAmplitude: { value: p.amplitude },
      uBloom: { value: p.bloom },
      uMix: { value: p.mix },
      uSpacing: { value: 0.5 },
      uColorShift: { value: p.colorShift },
      uVariance: { value: 0.1 },
      uSmoothing: { value: 1.0 },
      uMode: { value: 0.0 }, // dark mode
      uColor: { value: [0.42, 0.36, 0.91] as number[], type: 'vec3' as const }, // claw-accent purple
    }
  }, [volume, state])

  return { uniforms, state }
}
