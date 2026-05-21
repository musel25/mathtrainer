import type { QuestionResult } from '../lib/types'
import { createSession, recordResult, sessionStats } from '../lib/session'
import type { SessionSummary } from '../lib/api'

interface Props {
  results: QuestionResult[]
  summary: SessionSummary | null
  saveError: string | null
  onHome: () => void
  onDrillAgain: () => void
}

export function SummaryScreen({
  results, summary, saveError, onHome, onDrillAgain,
}: Props) {
  const stats = sessionStats(
    results.reduce((s, r) => recordResult(s, r), createSession(results.length)),
  )
  const ratingDelta = summary
    ? summary.rating_after - summary.rating_before
    : 0
  const arrow = ratingDelta >= 0 ? '▲' : '▼'
  const deltaColor = ratingDelta >= 0 ? 'green' : 'crimson'

  return (
    <div style={{ textAlign: 'center', marginTop: '14vh' }}>
      <h2>Session complete</h2>
      <p>Accuracy: {(stats.accuracy * 100).toFixed(0)}%
        ({stats.correct}/{stats.answered})</p>
      <p>Average time: {(stats.avgMsToSubmit / 1000).toFixed(1)}s</p>
      {summary && (
        <>
          <p>Score: {summary.total_score.toFixed(0)}</p>
          <p>
            Rating: {summary.rating_after.toFixed(1)}{' '}
            <span style={{ color: deltaColor }}>
              {arrow} {Math.abs(ratingDelta).toFixed(1)}
            </span>
          </p>
          {summary.weak_operations.length > 0 && (
            <p style={{ color: '#a60' }}>
              Worth practising: {summary.weak_operations.join(', ')}
            </p>
          )}
          <p style={{ color: '#888' }}>Saved (session #{summary.session_id}).</p>
        </>
      )}
      {saveError && <p style={{ color: 'crimson' }}>Save failed: {saveError}</p>}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8,
      }}>
        <button
          onClick={onHome}
          style={{ fontSize: 18, padding: '10px 24px' }}
        >
          🏠 Back to home
        </button>
        <button
          onClick={onDrillAgain}
          style={{ fontSize: 18, padding: '10px 24px' }}
        >
          Drill again
        </button>
      </div>
    </div>
  )
}
