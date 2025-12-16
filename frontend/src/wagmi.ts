import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

// Contract addresses (mainnet)
export const OVFL_ADDRESS = '0x0000000000000000000000000000000000000000' as const // TODO: Update after deployment
export const ADMIN_ADDRESS = '0x0000000000000000000000000000000000000000' as const // TODO: Update after deployment
export const SABLIER_ADDRESS = '0x3962f6585946823440d274aD7C719B02b49DE51E' as const

export const config = getDefaultConfig({
  appName: 'OVFL',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Get from https://cloud.walletconnect.com
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
})

// Example markets for development
export const EXAMPLE_MARKETS = [
  {
    address: '0x0000000000000000000000000000000000000001',
    name: 'PT-stETH',
    underlying: 'ETH',
    expiry: new Date('2025-06-26').getTime() / 1000,
    ptToken: '0x0000000000000000000000000000000000000002',
  },
  {
    address: '0x0000000000000000000000000000000000000003',
    name: 'PT-weETH',
    underlying: 'ETH',
    expiry: new Date('2025-06-26').getTime() / 1000,
    ptToken: '0x0000000000000000000000000000000000000004',
  },
]

