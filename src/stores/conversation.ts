import { create } from 'zustand'

export interface Conversation {
  id: string
  timestamp: number
  transcript: string
  response: string
}

interface ConversationState {
  conversations: Conversation[]
  isLoading: boolean

  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  clearConversations: () => void
  setLoading: (loading: boolean) => void
  loadConversations: () => Promise<void>
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  isLoading: false,

  setConversations: (conversations) => set({ conversations }),
  addConversation: (conversation) => {
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    }))
    window.voiceClaw.conversations.add(conversation)
  },
  clearConversations: () => {
    set({ conversations: [] })
    window.voiceClaw.conversations.clear()
  },
  setLoading: (loading) => set({ isLoading: loading }),
  loadConversations: async () => {
    set({ isLoading: true })
    const conversations = await window.voiceClaw.conversations.get()
    set({ conversations, isLoading: false })
  },
}))
