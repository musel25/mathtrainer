import { useEffect, useState, type ReactElement } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Operation, Progress } from '../lib/types'
import { getProgress } from '../lib/api'
import { Screen } from './ui/Screen'

// keep in sync with OPERATIONS in questionGenerator.ts and model.py
const OP_ORDER: Operation[] = [
  'add', 'subtract', 'multiply', 'divide', 'square', 'percent',
]

const AXIS = { fontFamily: 'Space Mono, monospace', fontSize: 11, fill: '#7d8590' }
const GRID = '#21262d'
const TOOLTIP = {
  contentStyle: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    fontFamily: 'Space Mono, monospace',
    fontSize: 12,
  },
  labelStyle: { color: '#7d8590' },
  itemStyle: { color: '#e6edf3' },
}
const CURSOR = { fill: 'rgba(255,255,255,0.04)' }

interface Props {
  onBack: () => void
}

function ChartBlock({ title, children }: {
  title: string
  children: ReactElement
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-2 font-mono text-sm text-muted">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        {children}
      </ResponsiveContainer>
    </div>
  )
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
    <Screen title="Progress" onBack={onBack} width={640}>
      {error && (
        <p className="text-center text-error">Could not load progress: {error}</p>
      )}
      {!error && !data && (
        <p className="text-center text-muted">Loading…</p>
      )}
      {data && data.history.length === 0 && (
        <p className="text-center text-muted">
          No finished sessions yet — complete a drill to see your progress.
        </p>
      )}

      {data && data.history.length > 0 && (
        <>
          <ChartBlock title="Rating over time">
            <LineChart data={data.history}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="n" tick={AXIS} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="rating" stroke="#3fb950"
                strokeWidth={2} dot={false} />
            </LineChart>
          </ChartBlock>

          <ChartBlock title="Score per session">
            <LineChart data={data.history}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="n" tick={AXIS} stroke={GRID} />
              <YAxis tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="score" stroke="#2f81f7"
                strokeWidth={2} dot={false} />
            </LineChart>
          </ChartBlock>

          <ChartBlock title="Average time per operation (s)">
            <BarChart
              data={data.operationTimes.map((o) => ({
                operation: o.operation,
                seconds: Number((o.avgMs / 1000).toFixed(2)),
              }))}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="operation" tick={AXIS} stroke={GRID} />
              <YAxis tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} cursor={CURSOR} />
              <Bar dataKey="seconds" fill="#d29922" />
            </BarChart>
          </ChartBlock>

          <ChartBlock title="Ability by operation">
            <BarChart
              data={OP_ORDER.map((op) => ({
                operation: op,
                // the API always returns all six operations; ?? 50 is a
                // defensive default (the cold-start rating) just in case
                rating: Math.round(data.operationRatings[op] ?? 50),
              }))}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="operation" tick={AXIS} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} cursor={CURSOR} />
              <Bar dataKey="rating" fill="#3fb950" />
            </BarChart>
          </ChartBlock>
        </>
      )}
    </Screen>
  )
}
