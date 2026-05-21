import { useEffect, useState } from 'react'
import type { Dashboard as DashboardData } from '../lib/types'
import { getDashboard } from '../lib/api'
import { CalendarHeatmap } from './CalendarHeatmap'

interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
}

export function Dashboard({ onStartDrill, onOpenProgress, onOpenSettings }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh' }}>
        <h1>mathtrainer</h1>
        <p style={{ color: 'crimson' }}>Could not load dashboard: {error}</p>
        <button onClick={onStartDrill} style={{ fontSize: 18, padding: '10px 24px' }}>
          Start daily drill
        </button>
      </div>
    )
  }
  if (!data) {
    return <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
  }

  const pct = data.today.goal > 0
    ? Math.min(100, (data.today.questions / data.today.goal) * 100)
    : 0

  return (
    <div style={{ maxWidth: 560, margin: '8vh auto', textAlign: 'center' }}>
      <h1>mathtrainer</h1>
      <div style={{ display: 'flex', justifyContent: 'space-around', margin: '24px 0' }}>
        <div>
          <div style={{ fontSize: 38 }}>🔥 {data.streak}</div>
          <div style={{ color: '#888' }}>day streak</div>
        </div>
        <div>
          <div style={{ fontSize: 38 }}>{data.rating.toFixed(0)}</div>
          <div style={{ color: '#888' }}>rating</div>
        </div>
        <div>
          <div style={{ fontSize: 38 }}>{data.totalSessions}</div>
          <div style={{ color: '#888' }}>sessions</div>
        </div>
      </div>

      <div style={{ margin: '20px 0' }}>
        <div style={{ color: '#888', marginBottom: 4 }}>
          Today: {data.today.questions} / {data.today.goal} questions
        </div>
        <div style={{ background: '#ebedf0', borderRadius: 6, height: 14 }}>
          <div style={{
            width: `${pct}%`, height: 14, borderRadius: 6, background: '#239a3b',
          }} />
        </div>
      </div>

      <button
        onClick={onStartDrill}
        style={{ fontSize: 20, padding: '12px 28px', margin: '8px 0' }}
      >
        Start daily drill
      </button>

      <div style={{ margin: '28px 0 8px', color: '#888' }}>Activity</div>
      <CalendarHeatmap cells={data.heatmap} />

      <div style={{ marginTop: 28 }}>
        <button onClick={onOpenProgress} style={{ marginRight: 12, padding: '8px 18px' }}>
          Progress
        </button>
        <button onClick={onOpenSettings} style={{ padding: '8px 18px' }}>
          Settings
        </button>
      </div>
    </div>
  )
}
