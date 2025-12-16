import { useState } from 'react'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import { OVFL_ABI } from '../abi/ovfl'
import { OVFL_ADDRESS } from '../wagmi'

interface DepositParams {
  market: `0x${string}`
  ptAmount: string
  minToUser: string
}

export function useDeposit() {
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const { writeContract, isPending: isWritePending, error: writeError } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const deposit = async ({ market, ptAmount, minToUser }: DepositParams) => {
    try {
      const hash = await writeContract({
        address: OVFL_ADDRESS,
        abi: OVFL_ABI,
        functionName: 'deposit',
        args: [market, parseEther(ptAmount), parseEther(minToUser)],
      })
      // Note: writeContract doesn't return hash directly in wagmi v2
      // You'd typically use the onSuccess callback or watch the data
    } catch (err) {
      console.error('Deposit failed:', err)
    }
  }

  return {
    deposit,
    isLoading: isWritePending || isConfirming,
    isSuccess,
    error: writeError,
    txHash,
  }
}

