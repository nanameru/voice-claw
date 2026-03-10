import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useActivityStore, type ActivityStep, type ActivityEntry, type ActivityStepEntry } from '../../stores/activity'

const STEP_CONFIG: Record<ActivityStep, { label: string; icon: string; color: string }> = {
  recording: { label: 'Recording', icon: '~', color: 'text-red-400' },
  transcribing: { label: 'Transcribing', icon: '>', color: 'text-claw-warning' },
  sending: { label: 'Sending', icon: '^', color: 'text-blue-400' },
  responding: { label: 'AI Responding', icon: '*', color: 'text-claw-accent' },
  tts: { label: 'Speaking', icon: '))', color: 'text-emerald-400' },
  done: { label: 'Done', icon: 'ok', color: 'text-claw-success' },
  error: { label: 'Error', icon: '!', color: 'text-claw-error' },
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function StepIndicator({ stepEntry, isActive }: { stepEntry: ActivityStepEntry; isActive: boolean }) {
  const config = STEP_CONFIG[stepEntry.step]
  const duration = stepEntry.completedAt
    ? formatDuration(stepEntry.completedAt - stepEntry.startedAt)
    : null

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className={`text-[10px] font-mono w-5 text-center ${config.color}`}>
        {config.icon}
      </span>
      <div className="flex-1 flex items-center gap-2">
        <span className={`text-[11px] ${isActive && !stepEntry.completedAt ? 'text-claw-text' : 'text-claw-text-dim'}`}>
          {config.label}
        </span>
        {stepEntry.detail && (
          <span className="text-[10px] text-claw-text-dim/60 truncate max-w-[120px]">
            {stepEntry.detail}
          </span>
        )}
      </div>
      {isActive && !stepEntry.completedAt ? (
        <motion.span
          className={`text-[10px] ${config.color}`}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1, repeat: Infinity }}
        >
          ...
        </motion.span>
      ) : duration ? (
        <span className="text-[10px] text-claw-text-dim/50 font-mono">{duration}</span>
      ) : null}
    </div>
  )
}

function ActivityCard({ entry, isActive }: { entry: ActivityEntry; isActive: boolean }) {
  const [expanded, setExpanded] = useState(isActive)
  const totalDuration = entry.completedAt
    ? formatDuration(entry.completedAt - entry.startedAt)
    : null

  const lastStep = entry.steps[entry.steps.length - 1]
  const statusColor = entry.error
    ? 'border-claw-error/30'
    : entry.completedAt
    ? 'border-claw-success/20'
    : 'border-claw-accent/30'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={`border-l-2 ${statusColor} pl-2.5 py-1`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group"
      >
        <div className="flex items-center gap-2">
          {isActive && !entry.completedAt ? (
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-claw-accent"
              animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          ) : entry.error ? (
            <div className="w-1.5 h-1.5 rounded-full bg-claw-error" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-claw-success/60" />
          )}
          <span className="text-[11px] text-claw-text-dim">
            {formatTime(entry.startedAt)}
          </span>
          {entry.transcribedText && (
            <span className="text-[11px] text-claw-text truncate max-w-[160px]">
              {entry.transcribedText}
            </span>
          )}
          {entry.userInput && !entry.transcribedText && (
            <span className="text-[11px] text-claw-text truncate max-w-[160px]">
              {entry.userInput}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalDuration && (
            <span className="text-[10px] text-claw-text-dim/50 font-mono">{totalDuration}</span>
          )}
          <span className="text-[10px] text-claw-text-dim/40 group-hover:text-claw-text-dim transition-colors">
            {expanded ? '-' : '+'}
          </span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-3.5 mt-1 space-y-0.5"
          >
            {entry.steps.map((s, i) => (
              <StepIndicator
                key={`${s.step}-${i}`}
                stepEntry={s}
                isActive={isActive && i === entry.steps.length - 1}
              />
            ))}

            {entry.error && (
              <div className="text-[10px] text-claw-error mt-1 pl-7">
                {entry.error}
              </div>
            )}

            {entry.aiResponse && (
              <div className="text-[10px] text-claw-text-dim/60 mt-1 pl-7 truncate max-w-full">
                AI: {entry.aiResponse.slice(0, 80)}{entry.aiResponse.length > 80 ? '...' : ''}
              </div>
            )}

            {!isActive && lastStep && !entry.completedAt && (
              <div className="text-[10px] text-claw-warning mt-1 pl-7">
                Interrupted
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ActivityPanel() {
  const entries = useActivityStore((s) => s.entries)
  const currentEntryId = useActivityStore((s) => s.currentEntryId)
  const clearAll = useActivityStore((s) => s.clearAll)

  if (entries.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="bg-claw-surface/50 rounded-lg border border-claw-border/50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-claw-border/30">
          <span className="text-[10px] text-claw-text-dim uppercase tracking-wider font-medium">
            Activity
          </span>
          <div className="flex items-center gap-2">
            {currentEntryId && (
              <motion.span
                className="text-[10px] text-claw-accent"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                LIVE
              </motion.span>
            )}
            <button
              onClick={clearAll}
              className="text-[10px] text-claw-text-dim/40 hover:text-claw-text-dim transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="px-3 py-2 space-y-1.5 max-h-40 overflow-y-auto">
          <AnimatePresence>
            {entries.slice(0, 10).map((entry) => (
              <ActivityCard
                key={entry.id}
                entry={entry}
                isActive={entry.id === currentEntryId}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
