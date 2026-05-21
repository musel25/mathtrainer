import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Progress } from '../lib/types'
import { getProgress } from '../lib/api'

interface Props {
  onBack: () => void
}

export function ProgressPage({ onBack }: Props) {
  const [data, setData] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProgress()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div style={{ maxWidth: 640, margin: '6vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Progress</h2>

      {error && <p style={{ color: 'crimson' }}>Could not load progress: {error}</p>}
      {!error && !data && <p style={{ textAlign: 'center' }}>Loading…</p>}

      {data && data.history.length === 0 && (
        <p style={{ textAlign: 'center', color: '#888' }}>
          No finished sessions yet — complete a drill to see your progress.
        </p>
      )}

      {data && data.history.length > 0 && (
        <>
          <h3>Rating over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="n" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="rating" stroke="#239a3b" />
            </LineChart>
          </ResponsiveContainer>

          <h3>Score per session</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="n" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#1f6feb" />
            </LineChart>
          </ResponsiveContainer>

          <h3>Average time per operation (s)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data.operationTimes.map((o) => ({
                operation: o.operation,
                seconds: Number((o.avgMs / 1000).toFixed(2)),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="operation" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="seconds" fill="#a6611a" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
