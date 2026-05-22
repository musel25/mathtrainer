interface Props {
  value: number
  max: number
  className?: string
}

export function ProgressBar({ value, max, className = '' }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className="h-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
