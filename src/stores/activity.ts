import { create } from 'zustand'

export type ActivityStep =
  | 'recording'
  | 'transcribing'
  | 'sending'
  | 'responding'
  | 'tts'
  | 'done'
  | 'error'

export interface ActivityEntry {
  id: string
  startedAt: number
  completedAt?: number
  steps: ActivityStepEntry[]
  userInput?: string
  transcribedText?: string
  aiResponse?: string
  error?: string
}

export interface ActivityStepEntry {
  step: ActivityStep
  startedAt: number
  completedAt?: number
  detail?: string
}

interface ActivityState {
  entries: ActivityEntry[]
  currentEntryId: string | null

  startActivity: () => string
  addStep: (step: ActivityStep, detail?: string) => void
  completeStep: (step: ActivityStep) => void
  setUserInput: (text: string) => void
  setTranscribedText: (text: string) => void
  setAiResponse: (text: string) => void
  completeActivity: () => void
  failActivity: (error: string) => void
  clearAll: () => void
}

const MAX_ENTRIES = 20

export const useActivityStore = create<ActivityState>((set, get) => ({
  entries: [],
  currentEntryId: null,

  startActivity: () => {
    const id = crypto.randomUUID()
    const entry: ActivityEntry = {
      id,
      startedAt: Date.now(),
      steps: [],
    }
    set((state) => ({
      currentEntryId: id,
      entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
    }))
    return id
  },

  addStep: (step, detail) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === currentEntryId
          ? {
              ...e,
              steps: [
                ...e.steps,
                { step, startedAt: Date.now(), detail },
              ],
            }
          : e
      ),
    }))
  },

  completeStep: (step) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === currentEntryId
          ? {
              ...e,
              steps: e.steps.map((s) =>
                s.step === step && !s.completedAt
                  ? { ...s, completedAt: Date.now() }
                  : s
              ),
            }
          : e
      ),
    }))
  },

  setUserInput: (text) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === currentEntryId ? { ...e, userInput: text } : e
      ),
    }))
  },

  setTranscribedText: (text) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === currentEntryId ? { ...e, transcribedText: text } : e
      ),
    }))
  },

  setAiResponse: (text) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      entries: state.entries.map((e) =>
        e.id === currentEntryId ? { ...e, aiResponse: text } : e
      ),
    }))
  },

  completeActivity: () => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      currentEntryId: null,
      entries: state.entries.map((e) =>
        e.id === currentEntryId
          ? { ...e, completedAt: Date.now() }
          : e
      ),
    }))
  },

  failActivity: (error) => {
    const { currentEntryId } = get()
    if (!currentEntryId) return
    set((state) => ({
      currentEntryId: null,
      entries: state.entries.map((e) =>
        e.id === currentEntryId
          ? { ...e, completedAt: Date.now(), error }
          : e
      ),
    }))
  },

  clearAll: () => set({ entries: [], currentEntryId: null }),
}))
