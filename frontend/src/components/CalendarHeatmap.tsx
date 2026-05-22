import type { HeatmapCell } from '../lib/types'

interface Props {
  cells: HeatmapCell[]
}

function shade(score: number, max: number): string {
  if (score <= 0) return '#21262d'
  const t = max > 0 ? score / max : 0
  if (t < 0.25) return '#0e4429'
  if (t < 0.5) return '#006d32'
  if (t < 0.75) return '#26a641'
  return '#3fb950'
}

/** A GitHub-style heatmap: 7 rows (days) by N columns (weeks). */
export function CalendarHeatmap({ cells }: Props) {
  const max = cells.reduce((m, c) => Math.max(m, c.score), 0)
  const weeks: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return (
    <div className="flex justify-center gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.questions} questions`}
              className="h-3 w-3 rounded-[2px]"
              style={{ background: shade(c.score, max) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
