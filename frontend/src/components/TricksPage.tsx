import { useEffect, useState } from 'react'
import {
  TRICKS, CATEGORY_META, TRICK_BY_SLUG, type Trick,
} from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'
import {
  masteryLevel, needsWork, categorySummary, type MasteryLevel,
} from '../lib/trickMastery'
import { Screen } from './ui/Screen'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'

interface Props {
  onBack: () => void
  onLearn: (trick: Trick) => void
}

/** Mastery level → ProgressBar fill colour. */
const FILL: Record<MasteryLevel, string> = {
  unpracticed: 'bg-dim',
  weak: 'bg-error',
  ok: 'bg-streak',
  strong: 'bg-success',
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
    const level = masteryLevel(stat)
    const pct = stat && stat.attempts > 0
      ? Math.round(stat.proficiency * 100)
      : null
    return (
      <Card key={trick.slug} className="mb-3.5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="text-base text-text">
            {trick.name}
            {trick.autoDetect === false && (
              <span className="ml-2 rounded border border-accent/50 px-1.5
                py-0.5 align-middle font-mono text-[10px] text-accent">
                core method
              </span>
            )}
          </strong>
          <span className="font-mono text-xs text-muted">
            {pct === null
              ? 'not practised'
              : `${pct}% (${stat.correct}/${stat.attempts})`}
          </span>
        </div>
        <ProgressBar
          value={pct ?? 0}
          max={100}
          className="my-2.5"
          fillClassName={FILL[level]}
        />
        <p className="my-3 whitespace-pre-line text-sm text-muted">
          {trick.lesson}
        </p>
        <Button onClick={() => onLearn(trick)}>Practise this trick</Button>
      </Card>
    )
  }

  const weakTricks = needsWork(stats)
    .map((slug) => TRICK_BY_SLUG[slug])
    .filter((t): t is Trick => !!t)

  return (
    <Screen title="Tricks" onBack={onBack} width={600}>
      <p className="-mt-4 mb-2 text-center text-sm text-muted">
        {TRICKS.length} tricks &amp; methods
      </p>
      {error && (
        <p className="text-error">Could not load proficiency: {error}</p>
      )}

      {weakTricks.length > 0 && (
        <section>
          <h3 className="mb-3 mt-4 border-b border-error/40 pb-1
            font-mono text-sm text-error">
            Needs work{' '}
            <span className="text-muted">({weakTricks.length})</span>
          </h3>
          {weakTricks.map(renderTrick)}
        </section>
      )}

      {CATEGORY_META.map(({ id, label }) => {
        const tricks = TRICKS.filter((t) => t.category === id)
        if (tricks.length === 0) return null
        const summary = categorySummary(tricks.map((t) => t.slug), stats)
        return (
          <section key={id}>
            <h3 className="mb-3 mt-7 flex items-baseline justify-between gap-3
              border-b border-success/40 pb-1 font-mono text-sm text-success">
              <span>
                {label}{' '}
                <span className="text-muted">({tricks.length})</span>
              </span>
              <span className="text-muted">
                {summary.practised}/{summary.total} practised
                {summary.practised > 0 &&
                  ` · avg ${Math.round(summary.avgProficiency * 100)}%`}
              </span>
            </h3>
            {tricks.map(renderTrick)}
          </section>
        )
      })}
    </Screen>
  )
}
