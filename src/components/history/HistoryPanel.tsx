import { motion } from 'framer-motion'
import { useEffect } from 'react'
import { useConversationStore } from '../../stores/conversation'
import { useUIStore } from '../../stores/ui'

export function HistoryPanel() {
  const { conversations, loadConversations, clearConversations } = useConversationStore()
  const { setView } = useUIStore()

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="w-full h-full flex flex-col p-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-claw-text">History</h2>
        <div className="flex gap-2">
          {conversations.length > 0 && (
            <button
              onClick={clearConversations}
              className="text-xs text-claw-error hover:text-claw-error/80 transition-colors"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setView('overlay')}
            className="text-xs text-claw-text-dim hover:text-claw-text transition-colors"
          >
            Back
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {conversations.length === 0 ? (
          <p className="text-sm text-claw-text-dim text-center py-8">No conversations yet</p>
        ) : (
          conversations.map((conv, i) => (
            <motion.div
              key={conv.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-claw-surface/50 border border-claw-border rounded-lg p-3 space-y-1"
            >
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-claw-text-dim">
                  {new Date(conv.timestamp).toLocaleString('ja-JP')}
                </span>
              </div>
              <p className="text-xs text-claw-accent-light truncate">{conv.transcript}</p>
              <p className="text-xs text-claw-text-dim truncate">{conv.response}</p>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}
