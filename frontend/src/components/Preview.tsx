import { motion } from 'framer-motion'

interface PreviewProps {
  toUser: string
  toStream: string
  fee: string
  rate: string
  symbol: string
  expiry: string
  isLoading?: boolean
}

export default function Preview({ toUser, toStream, fee, rate, symbol, expiry, isLoading }: PreviewProps) {
  const rows = [
    { label: 'Immediate', value: `${toUser} ${symbol}`, highlight: true },
    { label: 'Streamed', value: `${toStream} ${symbol}`, subtext: `until ${expiry}` },
    { label: 'Fee', value: fee === '0' ? 'No fee' : `${fee} ETH` },
    { label: 'Rate', value: `${rate}%` },
  ]

  return (
    <div className="space-y-2">
      <label className="text-sm text-white/50">You Receive</label>
      
      <div className="bg-ovfl-800/30 rounded-xl p-4 space-y-3">
        {rows.map((row, i) => (
          <motion.div
            key={row.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: isLoading ? 0.5 : 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
            className="flex items-center justify-between"
          >
            <span className="text-white/50 text-sm">{row.label}</span>
            <div className="text-right">
              <span className={`font-medium ${row.highlight ? 'text-accent' : 'text-white'}`}>
                {isLoading ? '...' : row.value}
              </span>
              {row.subtext && (
                <div className="text-xs text-white/40">{row.subtext}</div>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

