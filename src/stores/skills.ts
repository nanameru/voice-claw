import { create } from 'zustand'
import type { Skill } from '../types/skill'

interface SkillsState {
  skills: Skill[]
  loading: boolean
  error: string | null

  fetchSkills: () => Promise<void>
  enableSkill: (skillId: string) => Promise<void>
  disableSkill: (skillId: string) => Promise<void>
  updateSkillConfig: (skillId: string, config: Record<string, unknown>) => Promise<void>
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  loading: false,
  error: null,

  fetchSkills: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.voiceClaw.gateway.rpc('skills.status') as {
        skills?: Array<{
          skillKey: string
          slug?: string
          name?: string
          description?: string
          enabled?: boolean
          icon?: string
          version?: string
          author?: string
          config?: Record<string, unknown>
          bundled?: boolean
          always?: boolean
        }>
      }

      const skills: Skill[] = (result?.skills || []).map((s) => ({
        id: s.skillKey,
        slug: s.slug || s.skillKey,
        name: s.name || s.skillKey,
        description: s.description || '',
        enabled: s.enabled ?? true,
        icon: s.icon || '🔧',
        version: s.version || '0.0.0',
        author: s.author,
        config: s.config,
        isCore: !!(s.bundled && s.always),
        isBundled: !!s.bundled,
      }))

      set({ skills, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch skills',
        loading: false,
      })
    }
  },

  enableSkill: async (skillId: string) => {
    try {
      await window.voiceClaw.gateway.rpc('skills.update', {
        skillKey: skillId,
        enabled: true,
      })
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, enabled: true } : s
        ),
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to enable skill' })
    }
  },

  disableSkill: async (skillId: string) => {
    const skill = get().skills.find((s) => s.id === skillId)
    if (skill?.isCore) return // Core skills cannot be disabled

    try {
      await window.voiceClaw.gateway.rpc('skills.update', {
        skillKey: skillId,
        enabled: false,
      })
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, enabled: false } : s
        ),
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to disable skill' })
    }
  },

  updateSkillConfig: async (skillId: string, config: Record<string, unknown>) => {
    try {
      await window.voiceClaw.gateway.rpc('skills.update', {
        skillKey: skillId,
        config,
      })
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === skillId ? { ...s, config } : s
        ),
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update skill config' })
    }
  },
}))
