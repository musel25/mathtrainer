import type { HeatmapCell } from '../lib/types'

interface Props {
  cells: HeatmapCell[]
}

function shade(score: number, max: number): string {
  if (score <= 0) return '#ebedf0'
  const t = max > 0 ? score / max : 0
  if (t < 0.25) return '#c6e48b'
  if (t < 0.5) return '#7bc96f'
  if (t < 0.75) return '#239a3b'
  return '#196127'
}

/** A GitHub-style heatmap: 7 rows (days) by N columns (weeks). */
export function CalendarHeatmap({ cells }: Props) {
  const max = cells.reduce((m, c) => Math.max(m, c.score), 0)
  const weeks: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {week.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.questions} questions`}
              style={{
                width: 12, height: 12, borderRadius: 2,
                background: shade(c.score, max),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
