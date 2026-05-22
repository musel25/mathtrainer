import type { Trick } from '../lib/tricks'
import { Card } from './ui/Card'

interface Props {
  trick: Trick
}

/** The full explanation of a trick — shown when the user misses a question. */
export function TrickExplanation({ trick }: Props) {
  return (
    <Card className="mt-4 w-full max-w-[420px] p-4 text-left">
      <div className="mb-1 font-mono text-sm text-streak">💡 {trick.name}</div>
      <p className="whitespace-pre-line text-sm text-muted">{trick.lesson}</p>
    </Card>
  )
}
