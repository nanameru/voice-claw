export interface CronJob {
  id: string
  name: string
  message: string
  schedule: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastRun?: { time: string; success: boolean; error?: string }
  nextRun?: string
}

export interface CronJobInput {
  name: string
  message: string
  schedule: string
  enabled?: boolean
}
