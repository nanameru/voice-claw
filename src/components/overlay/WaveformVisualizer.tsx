import { motion } from 'framer-motion'

interface WaveformVisualizerProps {
  audioData: number[]
  isActive: boolean
}

export function WaveformVisualizer({ audioData, isActive }: WaveformVisualizerProps) {
  const bars = audioData.slice(0, 24)

  return (
    <div className="flex items-center justify-center gap-[2px] h-12">
      {bars.map((value, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-gradient-to-t from-claw-accent to-claw-accent-light"
          animate={{
            height: isActive ? Math.max(4, value * 40) : 4,
            opacity: isActive ? 0.6 + value * 0.4 : 0.3,
          }}
          transition={{
            duration: 0.05,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}
