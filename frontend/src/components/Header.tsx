import { ConnectButton } from '@rainbow-me/rainbowkit'

export default function Header() {
  return (
    <header className="w-full px-4 py-4 md:px-8">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center">
              <span className="text-ovfl-900 font-bold text-lg">O</span>
            </div>
            <div className="absolute inset-0 rounded-xl bg-accent/20 blur-lg -z-10" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">OVFL</h1>
            <p className="text-xs text-white/50 hidden sm:block">Unlock PT yield early</p>
          </div>
        </div>

        {/* Connect Button */}
        <ConnectButton 
          chainStatus="icon"
          showBalance={false}
          accountStatus={{
            smallScreen: 'avatar',
            largeScreen: 'full',
          }}
        />
      </div>
    </header>
  )
}

