import { useState } from 'react'
import type { QuestionResult } from '../lib/types'
import { applicableTricks } from '../lib/tricks'
import { TrickExplanation } from './TrickExplanation'

interface Props {
  result: QuestionResult
}

/** One row of the post-session review. Expands to show the trick(s) that
 *  apply to the question. */
export function ReviewRow({ result: r }: Props) {
  const [open, setOpen] = useState(false)
  const tricks = applicableTricks(r.question)
  const hasTricks = tricks.length > 0

  return (
    <div>
      <button
        type="button"
        disabled={!hasTricks}
        aria-expanded={hasTricks ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left font-mono
          text-sm transition-colors enabled:hover:bg-bg disabled:cursor-default"
      >
        <span className={r.isCorrect ? 'text-success' : 'text-error'}>
          {r.isCorrect ? '✓' : '✗'}
        </span>
        <span className="flex-1 text-text">
          {r.question.prompt} = {r.question.answer}
          {hasTricks && (
            <span className="text-streak">
              {' · 💡 '}{tricks.map((t) => t.name).join(', ')}
            </span>
          )}
        </span>
        {!r.isCorrect && (
          <span className="text-error">
            {r.givenAnswer === null ? 'skipped' : `you: ${r.givenAnswer}`}
          </span>
        )}
        <span className="text-dim">{(r.msToSubmit / 1000).toFixed(1)}s</span>
        <span className="w-3 text-dim">
          {hasTricks ? (open ? '▾' : '▸') : ''}
        </span>
      </button>
      {open && (
        <div className="bg-bg px-3 py-3">
          {tricks.map((t) => (
            <TrickExplanation key={t.slug} trick={t} className="mb-3 last:mb-0" />
          ))}
        </div>
      )}
    </div>
  )
}
