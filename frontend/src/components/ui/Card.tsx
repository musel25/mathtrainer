import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-border bg-surface ${className}`.trim()}
      {...rest}
    />
  )
}
