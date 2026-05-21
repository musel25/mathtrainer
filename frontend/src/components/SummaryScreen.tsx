import type { QuestionResult } from '../lib/types'
import { createSession, recordResult, sessionStats } from '../lib/session'
import type { SessionSummary } from '../lib/api'

interface Props {
  results: QuestionResult[]
  summary: SessionSummary | null
  saveError: string | null
  onRestart: () => void
}

export function SummaryScreen({ results, summary, saveError, onRestart }: Props) {
  const stats = sessionStats(
    results.reduce((s, r) => recordResult(s, r), createSession(results.length)),
  )
  return (
    <div style={{ textAlign: 'center', marginTop: '16vh' }}>
      <h2>Session complete</h2>
      <p>Accuracy: {(stats.accuracy * 100).toFixed(0)}%
        ({stats.correct}/{stats.answered})</p>
      <p>Average time: {(stats.avgMsToSubmit / 1000).toFixed(1)}s</p>
      <p>Score: {stats.totalScore.toFixed(0)}</p>
      {summary && <p style={{ color: '#888' }}>Saved (session #{summary.session_id}).</p>}
      {saveError && <p style={{ color: 'crimson' }}>Save failed: {saveError}</p>}
      <button onClick={onRestart} style={{ fontSize: 18, padding: '10px 24px' }}>
        Drill again
      </button>
    </div>
  )
}
