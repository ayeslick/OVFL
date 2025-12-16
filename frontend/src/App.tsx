import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Header from './components/Header'
import Card from './components/Card'
import TabToggle from './components/TabToggle'
import DepositTab from './components/DepositTab'
import ClaimTab from './components/ClaimTab'
import StreamList from './components/StreamList'

type Tab = 'deposit' | 'claim'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('deposit')

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 flex items-start justify-center px-4 py-8 md:py-16">
        <div className="w-full max-w-lg space-y-6">
          {/* Main Action Card */}
          <Card>
            <TabToggle activeTab={activeTab} onTabChange={setActiveTab} />
            
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'deposit' ? <DepositTab /> : <ClaimTab />}
              </motion.div>
            </AnimatePresence>
          </Card>

          {/* Streams Card */}
          <StreamList />
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-white/40 text-sm">
        <p>
          OVFL • Unlock PT yield early •{' '}
          <a 
            href="https://github.com/your-repo" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-accent/60 hover:text-accent transition-colors"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App

