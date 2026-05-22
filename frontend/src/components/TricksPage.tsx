import { useEffect, useState } from 'react'
import { TRICKS, CATEGORY_META, type Trick } from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'
import { Screen } from './ui/Screen'
import { Card } from './ui/Card'
import { Button } from './ui/Button'

interface Props {
  onBack: () => void
  onLearn: (trick: Trick) => void
}

export function TricksPage({ onBack, onLearn }: Props) {
  const [stats, setStats] = useState<Record<string, TrickStat>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTricks()
      .then((rows) => {
        const map: Record<string, TrickStat> = {}
        for (const r of rows) map[r.slug] = r
        setStats(map)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  function renderTrick(trick: Trick) {
    const stat = stats[trick.slug]
    const pct = stat && stat.attempts > 0
      ? Math.round(stat.proficiency * 100)
      : null
    return (
      <Card key={trick.slug} className="mb-3.5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="text-base text-text">{trick.name}</strong>
          <span className="font-mono text-xs text-muted">
            {pct === null
              ? 'not practised'
              : `${pct}% (${stat.correct}/${stat.attempts})`}
          </span>
        </div>
        <p className="my-3 whitespace-pre-line text-sm text-muted">
          {trick.lesson}
        </p>
        <Button onClick={() => onLearn(trick)}>Practise this trick</Button>
      </Card>
    )
  }

  return (
    <Screen title="Tricks" onBack={onBack} width={600}>
      <p className="-mt-4 mb-2 text-center text-sm text-muted">
        {TRICKS.length} mental-math shortcuts
      </p>
      {error && (
        <p className="text-error">Could not load proficiency: {error}</p>
      )}

      {CATEGORY_META.map(({ id, label }) => {
        const tricks = TRICKS.filter((t) => t.category === id)
        if (tricks.length === 0) return null
        return (
          <section key={id}>
            <h3 className="mb-3 mt-7 border-b border-success/40 pb-1
              font-mono text-sm text-success">
              {label}{' '}
              <span className="text-muted">({tricks.length})</span>
            </h3>
            {tricks.map(renderTrick)}
          </section>
        )
      })}
    </Screen>
  )
}
