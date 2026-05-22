interface Props {
  value: number
  max: number
  className?: string
  fillClassName?: string
}

export function ProgressBar({
  value, max, className = '', fillClassName = 'bg-accent',
}: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full ${fillClassName} transition-[width] duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
