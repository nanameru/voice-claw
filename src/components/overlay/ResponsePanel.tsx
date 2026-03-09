import { motion, AnimatePresence } from 'framer-motion'
import { useGatewayStore } from '../../stores/gateway'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

export function ResponsePanel() {
  const { streamingResponse, isStreaming } = useGatewayStore()

  if (!streamingResponse) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="w-full px-4"
      >
        <div className="bg-claw-surface/80 rounded-lg p-4 border border-claw-border max-h-64 overflow-y-auto">
          <div className="prose prose-invert prose-sm max-w-none text-claw-text">
            <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{streamingResponse}</ReactMarkdown>
          </div>
          {isStreaming && (
            <motion.div
              className="flex gap-1 mt-2"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-claw-accent" />
              <div className="w-1.5 h-1.5 rounded-full bg-claw-accent" />
              <div className="w-1.5 h-1.5 rounded-full bg-claw-accent" />
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
