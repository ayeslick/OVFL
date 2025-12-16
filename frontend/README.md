# OVFL Frontend

A sleek, dark glass-morphism dApp for depositing and claiming Pendle PT tokens.

## Tech Stack

- **Vite + React 18** - Fast development
- **wagmi v2 + viem** - Web3 interactions
- **RainbowKit** - Wallet connection
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
cd frontend
pnpm install
```

### Configuration

1. Get a WalletConnect Project ID from [WalletConnect Cloud](https://cloud.walletconnect.com)
2. Update `src/wagmi.ts`:
   - Set your `projectId`
   - Update `OVFL_ADDRESS` and `ADMIN_ADDRESS` after contract deployment

### Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build

```bash
pnpm build
```

### Preview Production Build

```bash
pnpm preview
```

## Project Structure

```
src/
├── main.tsx           # App entry with providers
├── App.tsx            # Main app component
├── wagmi.ts           # Web3 configuration
├── index.css          # Global styles
├── abi/
│   └── ovfl.ts        # Contract ABIs
├── components/
│   ├── Header.tsx     # Logo + wallet button
│   ├── Card.tsx       # Glass card component
│   ├── TabToggle.tsx  # Deposit/Claim tabs
│   ├── DepositTab.tsx # Deposit interface
│   ├── ClaimTab.tsx   # Claim interface
│   ├── MarketSelect.tsx
│   ├── AmountInput.tsx
│   ├── Preview.tsx
│   ├── ActionButton.tsx
│   ├── StreamList.tsx # Sablier streams
│   └── Toast.tsx      # Notifications
└── hooks/
    ├── useDeposit.ts
    ├── useClaim.ts
    ├── usePreview.ts
    └── useStreams.ts
```

## Customization

### Colors

Edit `tailwind.config.ts` to change the color scheme:

```ts
colors: {
  ovfl: { ... },    // Background colors
  accent: { ... },  // Accent/highlight colors
}
```

### Markets

Update `EXAMPLE_MARKETS` in `src/wagmi.ts` with real Pendle market addresses after deployment.

