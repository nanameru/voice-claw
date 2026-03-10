import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useCronStore } from '../../stores/cron'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import type { CronJob, CronJobInput } from '../../types/cron'

// Schedule presets
const PRESETS = [
  { label: 'Every 5 min', value: '*/5 * * * *' },
  { label: 'Every 30 min', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day 9am', value: '0 9 * * *' },
  { label: 'Every Mon 9am', value: '0 9 * * 1' },
]

function CronJobDialog({
  job,
  onClose,
}: {
  job?: CronJob
  onClose: () => void
}) {
  const { createJob, updateJob } = useCronStore()
  const [name, setName] = useState(job?.name || '')
  const [message, setMessage] = useState(job?.message || '')
  const [schedule, setSchedule] = useState(job?.schedule || '0 * * * *')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim() || !message.trim() || !schedule.trim()) {
      setError('All fields are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (job) {
        await updateJob(job.id, { name, message, schedule })
      } else {
        await createJob({ name, message, schedule, enabled: true })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-claw-surface border border-claw-border rounded-xl p-5 w-full max-w-md"
      >
        <h3 className="text-sm font-semibold text-claw-text mb-3">
          {job ? 'Edit Task' : 'New Scheduled Task'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-claw-text-dim mb-1 block">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Daily report"
              className="w-full bg-claw-bg border border-claw-border rounded-lg px-3 py-2 text-xs text-claw-text focus:outline-none focus:border-claw-accent"
            />
          </div>

          <div>
            <label className="text-xs text-claw-text-dim mb-1 block">Message (sent to AI)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Generate a daily summary report..."
              className="w-full h-24 bg-claw-bg border border-claw-border rounded-lg px-3 py-2 text-xs text-claw-text font-mono resize-none focus:outline-none focus:border-claw-accent"
            />
          </div>

          <div>
            <label className="text-xs text-claw-text-dim mb-1 block">Schedule (cron expression)</label>
            <input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 * * * *"
              className="w-full bg-claw-bg border border-claw-border rounded-lg px-3 py-2 text-xs text-claw-text font-mono focus:outline-none focus:border-claw-accent"
            />
            <div className="flex flex-wrap gap-1 mt-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setSchedule(p.value)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    schedule === p.value
                      ? 'border-claw-accent text-claw-accent bg-claw-accent/10'
                      : 'border-claw-border text-claw-text-dim hover:text-claw-text'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-claw-error mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-claw-text-dim hover:text-claw-text border border-claw-border rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-claw-accent hover:bg-claw-accent/80 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : job ? 'Update' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export function CronPanel() {
  const { jobs, loading, error, fetchJobs, toggleJob, triggerJob, deleteJob } = useCronStore()
  const gatewayStatus = useGatewayStore((s) => s.status)
  const { setView } = useUIStore()
  const [dialogJob, setDialogJob] = useState<CronJob | undefined | null>(null) // null=closed, undefined=new

  useEffect(() => {
    if (gatewayStatus === 'connected') {
      fetchJobs()
    }
  }, [gatewayStatus, fetchJobs])

  const activeCount = jobs.filter((j) => j.enabled).length
  const failedCount = jobs.filter((j) => j.lastRun && !j.lastRun.success).length

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-claw-border/50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setView('overlay')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors"
          >
            ← Back
          </button>
          <h2 className="text-sm font-semibold text-claw-text">Scheduled Tasks</h2>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setDialogJob(undefined)}
            disabled={gatewayStatus !== 'connected'}
            className="text-xs text-claw-accent hover:text-claw-accent/80 disabled:opacity-40 transition-colors"
          >
            + New
          </button>
          <button
            onClick={() => fetchJobs()}
            disabled={loading || gatewayStatus !== 'connected'}
            className="text-xs text-claw-text-dim hover:text-claw-text disabled:opacity-40 transition-colors"
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {jobs.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b border-claw-border/30">
          <span className="text-[10px] text-claw-text-dim">
            Total: <span className="text-claw-text">{jobs.length}</span>
          </span>
          <span className="text-[10px] text-claw-text-dim">
            Active: <span className="text-claw-success">{activeCount}</span>
          </span>
          <span className="text-[10px] text-claw-text-dim">
            Stopped: <span className="text-claw-warning">{jobs.length - activeCount}</span>
          </span>
          {failedCount > 0 && (
            <span className="text-[10px] text-claw-text-dim">
              Failed: <span className="text-claw-error">{failedCount}</span>
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {gatewayStatus !== 'connected' && (
          <div className="text-xs text-claw-warning bg-claw-warning/10 rounded-lg px-3 py-2">
            Gateway not connected. Connect to manage tasks.
          </div>
        )}

        {error && (
          <div className="text-xs text-claw-error bg-claw-error/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading && jobs.length === 0 && (
          <div className="text-xs text-claw-text-dim text-center py-8">Loading tasks...</div>
        )}

        {!loading && jobs.length === 0 && gatewayStatus === 'connected' && (
          <div className="text-xs text-claw-text-dim text-center py-8">
            No scheduled tasks yet. Create one to automate AI interactions.
          </div>
        )}

        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-claw-surface/50 border border-claw-border/30 rounded-lg px-3 py-2.5"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full ${job.enabled ? 'bg-claw-success' : 'bg-claw-border'}`} />
                <span className="text-xs font-medium text-claw-text truncate">{job.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => triggerJob(job.id)}
                  className="text-[10px] text-claw-text-dim hover:text-claw-accent px-1.5 py-0.5 border border-claw-border rounded transition-colors"
                  title="Run now"
                >
                  Run
                </button>
                <button
                  onClick={() => setDialogJob(job)}
                  className="text-[10px] text-claw-text-dim hover:text-claw-text px-1.5 py-0.5 border border-claw-border rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleJob(job.id, !job.enabled)}
                  className={`relative w-7 h-3.5 rounded-full transition-colors ${
                    job.enabled ? 'bg-claw-accent' : 'bg-claw-border'
                  }`}
                >
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${
                    job.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${job.name}"?`)) deleteJob(job.id)
                  }}
                  className="text-[10px] text-claw-error/60 hover:text-claw-error px-1 transition-colors"
                >
                  x
                </button>
              </div>
            </div>
            <p className="text-[10px] text-claw-text-dim truncate">{job.message}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[10px] text-claw-text-dim font-mono">{job.schedule}</span>
              {job.nextRun && (
                <span className="text-[10px] text-claw-text-dim">
                  Next: {new Date(job.nextRun).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {job.lastRun && (
                <span className={`text-[10px] ${job.lastRun.success ? 'text-claw-success' : 'text-claw-error'}`}>
                  Last: {job.lastRun.success ? 'OK' : 'Failed'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {dialogJob !== null && (
        <CronJobDialog
          job={dialogJob}
          onClose={() => setDialogJob(null)}
        />
      )}
    </motion.div>
  )
}
