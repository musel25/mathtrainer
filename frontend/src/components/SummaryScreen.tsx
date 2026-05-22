import type { QuestionResult } from '../lib/types'
import { createSession, recordResult, sessionStats } from '../lib/session'
import type { SessionSummary } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'

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
  const up = ratingDelta >= 0

  return (
    <div className="mx-auto max-w-[480px] px-4 py-12">
      <h2 className="mb-6 text-center font-mono text-xl">session complete</h2>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Accuracy
          </div>
          <div className="font-mono text-2xl">
            {(stats.accuracy * 100).toFixed(0)}%
          </div>
          <div className="font-mono text-xs text-dim">
            {stats.correct}/{stats.answered}
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Avg time
          </div>
          <div className="font-mono text-2xl">
            {(stats.avgMsToSubmit / 1000).toFixed(1)}s
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Rating
          </div>
          <div className={`font-mono text-2xl ${up ? 'text-success' : 'text-error'}`}>
            {summary
              ? `${up ? '▲' : '▼'}${Math.abs(ratingDelta).toFixed(1)}`
              : '—'}
          </div>
          {summary && (
            <div className="font-mono text-xs text-dim">
              {summary.rating_after.toFixed(1)}
            </div>
          )}
        </Card>
      </div>

      {summary && (
        <p className="mb-4 text-center font-mono text-xs text-dim">
          score {summary.total_score.toFixed(0)} · saved #{summary.session_id}
        </p>
      )}
      {summary && summary.weak_operations.length > 0 && (
        <p className="mb-4 text-center text-sm text-streak">
          Worth practising: {summary.weak_operations.join(', ')}
        </p>
      )}
      {saveError && (
        <p className="mb-4 text-center text-sm text-error">
          Save failed: {saveError}
        </p>
      )}

      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">
        Review
      </div>
      <Card className="mb-6 divide-y divide-border">
        {results.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2 font-mono text-sm"
          >
            <span className={r.isCorrect ? 'text-success' : 'text-error'}>
              {r.isCorrect ? '✓' : '✗'}
            </span>
            <span className="flex-1 text-text">
              {r.question.prompt} = {r.question.answer}
            </span>
            {!r.isCorrect && (
              <span className="text-error">you: {r.givenAnswer ?? '—'}</span>
            )}
            <span className="text-dim">
              {(r.msToSubmit / 1000).toFixed(1)}s
            </span>
          </div>
        ))}
      </Card>

      <div className="flex justify-center gap-3">
        <Button onClick={onHome}>Home</Button>
        <Button variant="primary" onClick={onDrillAgain}>Drill again</Button>
      </div>
    </div>
  )
}
