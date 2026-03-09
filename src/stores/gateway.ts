import { create } from 'zustand'

interface GatewayState {
  status: 'connected' | 'connecting' | 'disconnected'
  isStreaming: boolean
  streamingResponse: string
  lastError: string | null

  setStatus: (status: 'connected' | 'connecting' | 'disconnected') => void
  setStreaming: (streaming: boolean) => void
  appendResponse: (chunk: string) => void
  setStreamingResponse: (response: string) => void
  clearResponse: () => void
  setLastError: (error: string | null) => void
}

export const useGatewayStore = create<GatewayState>((set) => ({
  status: 'disconnected',
  isStreaming: false,
  streamingResponse: '',
  lastError: null,

  setStatus: (status) => set({ status }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  appendResponse: (chunk) => set((state) => ({
    streamingResponse: state.streamingResponse + chunk,
  })),
  setStreamingResponse: (response) => set({ streamingResponse: response }),
  clearResponse: () => set({ streamingResponse: '', isStreaming: false }),
  setLastError: (error) => set({ lastError: error }),
}))
