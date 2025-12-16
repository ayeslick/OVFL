import { useAccount } from 'wagmi'

// Mock stream data - in production, query Sablier subgraph or events
interface Stream {
  id: string
  amount: string
  withdrawn: string
  asset: string
  endTime: number
}

export function useStreams() {
  const { address } = useAccount()

  // Mock data for UI development
  // In production, you'd query the Sablier subgraph:
  // https://thegraph.com/hosted-service/subgraph/sablier-labs/sablier-v2
  const mockStreams: Stream[] = address
    ? [
        {
          id: '1234',
          amount: '0.48',
          withdrawn: '0.24',
          asset: 'ovflETH',
          endTime: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days from now
        },
        {
          id: '1235',
          amount: '0.32',
          withdrawn: '0.32',
          asset: 'ovflETH',
          endTime: Math.floor(Date.now() / 1000) - 86400, // Already ended
        },
      ]
    : []

  return {
    streams: mockStreams,
    isLoading: false,
    error: null,
  }
}

