interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  balance: string
  symbol: string
  onMax: () => void
}

export default function AmountInput({ value, onChange, balance, symbol, onMax }: AmountInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-white/50">Amount</label>
        <button
          onClick={onMax}
          className="text-xs text-accent hover:text-accent-light transition-colors"
        >
          MAX
        </button>
      </div>
      
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          className="glass-input pr-24 text-xl font-medium"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-accent/20 flex items-center justify-center">
            <span className="text-accent text-xs font-bold">PT</span>
          </div>
          <span className="text-white/60 text-sm font-medium">{symbol}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-white/40">Balance:</span>
        <span className="text-white/60">{balance} {symbol}</span>
      </div>
    </div>
  )
}

