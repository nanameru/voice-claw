import { create } from 'zustand'
import type { CronJob, CronJobInput } from '../types/cron'

interface CronState {
  jobs: CronJob[]
  loading: boolean
  error: string | null

  fetchJobs: () => Promise<void>
  createJob: (input: CronJobInput) => Promise<void>
  updateJob: (id: string, patch: Partial<CronJobInput>) => Promise<void>
  deleteJob: (id: string) => Promise<void>
  toggleJob: (id: string, enabled: boolean) => Promise<void>
  triggerJob: (id: string) => Promise<void>
}

function transformCronJob(raw: Record<string, unknown>): CronJob {
  const schedule = raw.schedule as Record<string, unknown> | string
  const scheduleStr = typeof schedule === 'string'
    ? schedule
    : (schedule as Record<string, unknown>)?.expr as string || ''

  return {
    id: raw.id as string,
    name: raw.name as string || '',
    message: (raw.payload as Record<string, unknown>)?.message as string || '',
    schedule: scheduleStr,
    enabled: raw.enabled as boolean ?? true,
    createdAt: raw.createdAt as string || '',
    updatedAt: raw.updatedAt as string || '',
    lastRun: raw.lastRun as CronJob['lastRun'],
    nextRun: raw.nextRun as string,
  }
}

export const useCronStore = create<CronState>((set) => ({
  jobs: [],
  loading: false,
  error: null,

  fetchJobs: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.voiceClaw.gateway.rpc('cron.list', {
        includeDisabled: true,
      }) as { jobs?: Array<Record<string, unknown>> }

      const jobs = (result?.jobs || []).map(transformCronJob)
      set({ jobs, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch cron jobs',
        loading: false,
      })
    }
  },

  createJob: async (input: CronJobInput) => {
    try {
      await window.voiceClaw.gateway.rpc('cron.add', {
        name: input.name,
        schedule: { kind: 'cron', expr: input.schedule },
        payload: { kind: 'agentTurn', message: input.message },
        delivery: { mode: 'none' },
        enabled: input.enabled ?? true,
      })
      // Refetch to get server-generated fields
      await useCronStore.getState().fetchJobs()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create cron job' })
    }
  },

  updateJob: async (id: string, patch: Partial<CronJobInput>) => {
    try {
      const rpcPatch: Record<string, unknown> = {}
      if (patch.name !== undefined) rpcPatch.name = patch.name
      if (patch.enabled !== undefined) rpcPatch.enabled = patch.enabled
      if (patch.schedule !== undefined) {
        rpcPatch.schedule = { kind: 'cron', expr: patch.schedule }
      }
      if (patch.message !== undefined) {
        rpcPatch.payload = { kind: 'agentTurn', message: patch.message }
      }

      await window.voiceClaw.gateway.rpc('cron.update', { id, patch: rpcPatch })
      await useCronStore.getState().fetchJobs()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update cron job' })
    }
  },

  deleteJob: async (id: string) => {
    try {
      await window.voiceClaw.gateway.rpc('cron.remove', { id })
      set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete cron job' })
    }
  },

  toggleJob: async (id: string, enabled: boolean) => {
    try {
      await window.voiceClaw.gateway.rpc('cron.update', {
        id,
        patch: { enabled },
      })
      set((state) => ({
        jobs: state.jobs.map((j) => (j.id === id ? { ...j, enabled } : j)),
      }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to toggle cron job' })
    }
  },

  triggerJob: async (id: string) => {
    try {
      await window.voiceClaw.gateway.rpc('cron.run', { id, mode: 'force' })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to trigger cron job' })
    }
  },
}))
