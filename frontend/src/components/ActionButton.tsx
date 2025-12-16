import { motion } from 'framer-motion'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'

interface ActionButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  isLoading?: boolean
  loadingText?: string
}

export default function ActionButton({ 
  label, 
  onClick, 
  disabled = false, 
  isLoading = false,
  loadingText = 'Processing...'
}: ActionButtonProps) {
  const { isConnected } = useAccount()

  if (!isConnected) {
    return (
      <div className="w-full">
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              onClick={openConnectModal}
              className="btn-primary w-full"
            >
              Connect Wallet
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    )
  }

  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.01 }}
      whileTap={{ scale: disabled ? 1 : 0.99 }}
      onClick={onClick}
      disabled={disabled || isLoading}
      className="btn-primary w-full flex items-center justify-center gap-2"
    >
      {isLoading && (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {isLoading ? loadingText : label}
    </motion.button>
  )
}

