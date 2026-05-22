import { useEffect, useState } from 'react'
import type { Dashboard as DashboardData } from '../lib/types'
import { getDashboard } from '../lib/api'
import { CalendarHeatmap } from './CalendarHeatmap'
import { StatTile } from './ui/StatTile'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'
import { Line, LineChart } from 'recharts'

interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
  onOpenTricks: () => void
}

export function Dashboard({
  onStartDrill, onOpenProgress, onOpenSettings, onOpenTricks,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
        <h1 className="font-mono text-2xl">mathtrainer</h1>
        <p className="mt-4 text-error">Could not load dashboard: {error}</p>
        <Button variant="primary" onClick={onStartDrill} className="mt-6 px-7 py-3 text-base">
          › start drill
        </Button>
      </div>
    )
  }
  if (!data) {
    return <p className="py-32 text-center text-muted">Loading…</p>
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-12 text-center">
      <h1 className="font-mono text-2xl tracking-tight">mathtrainer</h1>

      <div className="my-8 flex justify-around">
        <StatTile label="Streak" value={data.streak} />
        <StatTile label="Rating" value={data.rating.toFixed(0)} accent />
        <StatTile label="Sessions" value={data.totalSessions} />
      </div>

      {data.ratingSparkline.length > 1 && (
        <div className="my-4">
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted">
            Rating trend
          </div>
          <div className="flex justify-center">
            <LineChart
              width={240}
              height={48}
              data={data.ratingSparkline.map((r, i) => ({ i, rating: r }))}
            >
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#3fb950"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </div>
        </div>
      )}

      <div className="my-6 text-left">
        <div className="mb-1.5 font-mono text-xs text-muted">
          today {data.today.questions}/{data.today.goal}
        </div>
        <ProgressBar value={data.today.questions} max={data.today.goal} />
      </div>

      <Button
        variant="primary"
        onClick={onStartDrill}
        className="px-7 py-3 text-base"
      >
        › start drill
      </Button>

      <div className="mb-2 mt-8 text-[10px] uppercase tracking-[0.12em] text-muted">
        Activity
      </div>
      <CalendarHeatmap cells={data.heatmap} />

      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={onOpenProgress}>Progress</Button>
        <Button onClick={onOpenTricks}>Tricks</Button>
        <Button onClick={onOpenSettings}>Settings</Button>
      </div>
    </div>
  )
}
