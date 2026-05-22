import type { Trick } from '../lib/tricks'

interface Props {
  trick: Trick
  className?: string
}

/** A trick's name + full lesson. The caller supplies the container. */
export function TrickExplanation({ trick, className = '' }: Props) {
  return (
    <div className={`text-left ${className}`.trim()}>
      <div className="mb-1 font-mono text-sm text-streak">💡 {trick.name}</div>
      <p className="whitespace-pre-line text-sm text-muted">{trick.lesson}</p>
    </div>
  )
}
