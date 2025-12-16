import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import Card from './Card'
import { useStreams } from '../hooks/useStreams'

export default function StreamList() {
  const { isConnected } = useAccount()
  const { streams, isLoading } = useStreams()

  if (!isConnected) return null

  const activeStreams = streams.filter(
    (s) => parseFloat(s.withdrawn) < parseFloat(s.amount)
  )

  if (activeStreams.length === 0 && !isLoading) {
    return null
  }

  const formatTimeRemaining = (endTime: number) => {
    const now = Math.floor(Date.now() / 1000)
    const remaining = endTime - now

    if (remaining <= 0) return 'Completed'

    const days = Math.floor(remaining / 86400)
    const hours = Math.floor((remaining % 86400) / 3600)

    if (days > 0) return `${days}d ${hours}h remaining`
    return `${hours}h remaining`
  }

  const getProgress = (withdrawn: string, total: string) => {
    return (parseFloat(withdrawn) / parseFloat(total)) * 100
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white">Your Streams</h3>
        <a
          href="https://app.sablier.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent hover:text-accent-light transition-colors"
        >
          View All →
        </a>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {activeStreams.map((stream, index) => (
            <motion.div
              key={stream.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-ovfl-800/30 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-sm">Stream #{stream.id}</div>
                    <div className="text-xs text-white/50">
                      {formatTimeRemaining(stream.endTime)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-accent">
                    {stream.withdrawn}/{stream.amount}
                  </div>
                  <div className="text-xs text-white/50">{stream.asset}</div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-ovfl-900 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${getProgress(stream.withdrawn, stream.amount)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-r from-accent to-accent-dark rounded-full"
                />
              </div>

              {/* Withdraw Button */}
              {parseFloat(stream.withdrawn) < parseFloat(stream.amount) && (
                <button className="w-full mt-3 btn-secondary text-sm">
                  Withdraw Available
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  )
}

