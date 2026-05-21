import { useEffect, useState } from 'react'
import { TRICKS, type Trick } from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'

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

  return (
    <div style={{ maxWidth: 600, margin: '6vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Tricks</h2>
      {error && <p style={{ color: 'crimson' }}>Could not load proficiency: {error}</p>}

      {TRICKS.map((trick) => {
        const stat = stats[trick.slug]
        const pct = stat && stat.attempts > 0
          ? Math.round(stat.proficiency * 100)
          : null
        return (
          <div
            key={trick.slug}
            style={{
              border: '1px solid #ddd', borderRadius: 8,
              padding: 16, margin: '14px 0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 18 }}>{trick.name}</strong>
              <span style={{ color: '#888' }}>
                {pct === null
                  ? 'not practised yet'
                  : `${pct}% (${stat.correct}/${stat.attempts})`}
              </span>
            </div>
            <p style={{ whiteSpace: 'pre-line', color: '#333' }}>{trick.lesson}</p>
            <button
              onClick={() => onLearn(trick)}
              style={{ padding: '8px 18px' }}
            >
              Practise this trick
            </button>
          </div>
        )
      })}
    </div>
  )
}
