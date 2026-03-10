export interface Skill {
  id: string
  slug: string
  name: string
  description: string
  enabled: boolean
  icon: string
  version: string
  author?: string
  config?: Record<string, unknown>
  isCore: boolean
  isBundled: boolean
}
