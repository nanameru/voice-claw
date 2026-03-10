import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useSkillsStore } from '../../stores/skills'
import { useGatewayStore } from '../../stores/gateway'
import { useUIStore } from '../../stores/ui'
import type { Skill } from '../../types/skill'

function SkillConfigDialog({ skill, onClose }: { skill: Skill; onClose: () => void }) {
  const { updateSkillConfig } = useSkillsStore()
  const [config, setConfig] = useState(JSON.stringify(skill.config || {}, null, 2))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    try {
      setSaving(true)
      setError('')
      const parsed = JSON.parse(config)
      await updateSkillConfig(skill.id, parsed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON')
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
        <h3 className="text-sm font-semibold text-claw-text mb-1">{skill.icon} {skill.name}</h3>
        <p className="text-xs text-claw-text-dim mb-3">{skill.description}</p>

        <label className="text-xs text-claw-text-dim mb-1 block">Configuration (JSON)</label>
        <textarea
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          className="w-full h-40 bg-claw-bg border border-claw-border rounded-lg px-3 py-2 text-xs text-claw-text font-mono resize-none focus:outline-none focus:border-claw-accent"
        />

        {error && <p className="text-xs text-claw-error mt-1">{error}</p>}

        <div className="flex justify-end gap-2 mt-3">
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
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export function SkillsPanel() {
  const { skills, loading, error, fetchSkills, enableSkill, disableSkill } = useSkillsStore()
  const gatewayStatus = useGatewayStore((s) => s.status)
  const { setView } = useUIStore()
  const [configSkill, setConfigSkill] = useState<Skill | null>(null)

  useEffect(() => {
    if (gatewayStatus === 'connected') {
      fetchSkills()
    }
  }, [gatewayStatus, fetchSkills])

  const handleToggle = async (skill: Skill) => {
    if (skill.isCore) return
    if (skill.enabled) {
      await disableSkill(skill.id)
    } else {
      await enableSkill(skill.id)
    }
  }

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
          <h2 className="text-sm font-semibold text-claw-text">Skills</h2>
        </div>
        <button
          onClick={() => fetchSkills()}
          disabled={loading || gatewayStatus !== 'connected'}
          className="text-xs text-claw-accent hover:text-claw-accent/80 disabled:opacity-40 transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {gatewayStatus !== 'connected' && (
          <div className="text-xs text-claw-warning bg-claw-warning/10 rounded-lg px-3 py-2">
            Gateway not connected. Connect to manage skills.
          </div>
        )}

        {error && (
          <div className="text-xs text-claw-error bg-claw-error/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading && skills.length === 0 && (
          <div className="text-xs text-claw-text-dim text-center py-8">Loading skills...</div>
        )}

        {!loading && skills.length === 0 && gatewayStatus === 'connected' && (
          <div className="text-xs text-claw-text-dim text-center py-8">
            No skills found. Make sure OpenClaw Gateway is running.
          </div>
        )}

        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center gap-3 bg-claw-surface/50 border border-claw-border/30 rounded-lg px-3 py-2.5"
          >
            <span className="text-lg">{skill.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-claw-text truncate">{skill.name}</span>
                <span className="text-[10px] text-claw-text-dim">v{skill.version}</span>
                {skill.isCore && (
                  <span className="text-[10px] px-1 py-0.5 bg-claw-accent/20 text-claw-accent rounded">core</span>
                )}
              </div>
              <p className="text-[10px] text-claw-text-dim truncate">{skill.description}</p>
            </div>
            <div className="flex items-center gap-1.5">
              {skill.config && Object.keys(skill.config).length > 0 && (
                <button
                  onClick={() => setConfigSkill(skill)}
                  className="text-[10px] text-claw-text-dim hover:text-claw-text px-1.5 py-0.5 border border-claw-border rounded"
                >
                  Config
                </button>
              )}
              <button
                onClick={() => handleToggle(skill)}
                disabled={skill.isCore}
                className={`relative w-8 h-4.5 rounded-full transition-colors ${
                  skill.enabled ? 'bg-claw-accent' : 'bg-claw-border'
                } ${skill.isCore ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div
                  className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                    skill.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      {configSkill && (
        <SkillConfigDialog skill={configSkill} onClose={() => setConfigSkill(null)} />
      )}
    </motion.div>
  )
}
