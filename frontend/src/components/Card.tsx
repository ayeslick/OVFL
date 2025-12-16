import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  glow?: boolean
}

export default function Card({ children, className = '', glow = false }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`
        glass-card p-6
        ${glow ? 'glow-border' : ''}
        ${className}
      `}
    >
      {children}
    </motion.div>
  )
}

