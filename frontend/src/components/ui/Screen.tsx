import type { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  title?: string
  onBack?: () => void
  width?: number
  children: ReactNode
}

export function Screen({ title, onBack, width = 600, children }: Props) {
  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: width }}>
      {onBack && (
        <Button onClick={onBack} aria-label="Back" className="mb-4">← Back</Button>
      )}
      {title && (
        <h2 className="mb-6 text-center font-mono text-xl text-text">{title}</h2>
      )}
      {children}
    </div>
  )
}
