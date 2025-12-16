export const OVFL_ABI = [
  // Deposit
  {
    inputs: [
      { name: 'market', type: 'address' },
      { name: 'ptAmount', type: 'uint256' },
      { name: 'minToUser', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [
      { name: 'toUser', type: 'uint256' },
      { name: 'toStream', type: 'uint256' },
      { name: 'streamId', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Claim
  {
    inputs: [
      { name: 'ptToken', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Preview Deposit
  {
    inputs: [
      { name: 'market', type: 'address' },
      { name: 'ptAmount', type: 'uint256' },
    ],
    name: 'previewDeposit',
    outputs: [
      { name: 'toUser', type: 'uint256' },
      { name: 'toStream', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'rateE18', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Preview Rate
  {
    inputs: [{ name: 'market', type: 'address' }],
    name: 'previewRate',
    outputs: [{ name: 'rateE18', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Claimable PT
  {
    inputs: [{ name: 'ptToken', type: 'address' }],
    name: 'claimablePt',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Series info
  {
    inputs: [{ name: 'market', type: 'address' }],
    name: 'series',
    outputs: [
      { name: 'approved', type: 'bool' },
      { name: 'twapDurationFixed', type: 'uint32' },
      { name: 'feeBps', type: 'uint16' },
      { name: 'expiryCached', type: 'uint256' },
      { name: 'ptToken', type: 'address' },
      { name: 'ovflToken', type: 'address' },
      { name: 'underlying', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Market deposit limits
  {
    inputs: [{ name: 'market', type: 'address' }],
    name: 'marketDepositLimits',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Market total deposited
  {
    inputs: [{ name: 'market', type: 'address' }],
    name: 'marketTotalDeposited',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Min PT amount
  {
    inputs: [],
    name: 'minPtAmount',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: true, name: 'market', type: 'address' },
      { indexed: false, name: 'ptAmount', type: 'uint256' },
      { indexed: false, name: 'toUser', type: 'uint256' },
      { indexed: false, name: 'toStream', type: 'uint256' },
      { indexed: false, name: 'streamId', type: 'uint256' },
    ],
    name: 'Deposited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: true, name: 'market', type: 'address' },
      { indexed: true, name: 'ptToken', type: 'address' },
      { indexed: false, name: 'ovflToken', type: 'address' },
      { indexed: false, name: 'burnedAmount', type: 'uint256' },
      { indexed: false, name: 'ptOut', type: 'uint256' },
    ],
    name: 'Claimed',
    type: 'event',
  },
] as const

export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export const SABLIER_ABI = [
  {
    inputs: [{ name: 'streamId', type: 'uint256' }],
    name: 'getStream',
    outputs: [
      {
        components: [
          { name: 'sender', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'totalAmount', type: 'uint128' },
          { name: 'asset', type: 'address' },
          { name: 'cancelable', type: 'bool' },
          { name: 'transferable', type: 'bool' },
          { name: 'startTime', type: 'uint40' },
          { name: 'cliffTime', type: 'uint40' },
          { name: 'endTime', type: 'uint40' },
          { name: 'isCanceled', type: 'bool' },
          { name: 'isDepleted', type: 'bool' },
          { name: 'wasCanceled', type: 'bool' },
        ],
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'streamId', type: 'uint256' }],
    name: 'withdrawableAmountOf',
    outputs: [{ type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'streamId', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint128' },
    ],
    name: 'withdraw',
    outputs: [{ type: 'uint128' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

