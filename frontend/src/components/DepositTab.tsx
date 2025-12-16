import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import MarketSelect from './MarketSelect'
import AmountInput from './AmountInput'
import Preview from './Preview'
import ActionButton from './ActionButton'
import { usePreview } from '../hooks/usePreview'
import { useDeposit } from '../hooks/useDeposit'
import { EXAMPLE_MARKETS } from '../wagmi'

type Market = typeof EXAMPLE_MARKETS[number]

export default function DepositTab() {
  const { address } = useAccount()
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null)
  const [amount, setAmount] = useState('')
  
  // Mock balance - in production, fetch from chain
  const balance = '12.5'
  const symbol = selectedMarket?.name.replace('PT-', '') || 'ETH'

  const { preview, isLoading: previewLoading } = usePreview(
    selectedMarket?.address,
    amount
  )

  const { deposit, isLoading: depositLoading, isSuccess } = useDeposit()

  // Reset amount on success
  useEffect(() => {
    if (isSuccess) {
      setAmount('')
    }
  }, [isSuccess])

  const handleMax = () => {
    setAmount(balance)
  }

  const handleDeposit = () => {
    if (!selectedMarket || !amount || !preview) return
    deposit({
      market: selectedMarket.address as `0x${string}`,
      ptAmount: amount,
      minToUser: preview.toUser,
    })
  }

  const formatExpiry = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const isDisabled = !selectedMarket || !amount || parseFloat(amount) <= 0

  return (
    <div className="space-y-6">
      <MarketSelect
        selectedMarket={selectedMarket}
        onSelect={setSelectedMarket}
      />

      <AmountInput
        value={amount}
        onChange={setAmount}
        balance={balance}
        symbol={selectedMarket?.name || 'PT'}
        onMax={handleMax}
      />

      {selectedMarket && amount && parseFloat(amount) > 0 && (
        <Preview
          toUser={preview?.toUser || '0'}
          toStream={preview?.toStream || '0'}
          fee={preview?.fee || '0'}
          rate={preview?.rate || '0'}
          symbol={`ovfl${symbol}`}
          expiry={formatExpiry(selectedMarket.expiry)}
          isLoading={previewLoading}
        />
      )}

      <ActionButton
        label="Deposit"
        onClick={handleDeposit}
        disabled={isDisabled}
        isLoading={depositLoading}
        loadingText="Depositing..."
      />

      {!address && (
        <p className="text-center text-sm text-white/40">
          Connect your wallet to deposit PT tokens
        </p>
      )}
    </div>
  )
}

