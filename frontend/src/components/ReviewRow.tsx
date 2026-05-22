import { useId, useState } from 'react'
import type { QuestionResult } from '../lib/types'
import { applicableTricks } from '../lib/tricks'
import { TrickExplanation } from './TrickExplanation'

interface Props {
  result: QuestionResult
}

const ROW = 'flex w-full items-center gap-3 px-3 py-2 text-left font-mono text-sm'

/** One row of the post-session review. When the question has applicable
 *  tricks, the row is a button that expands to show their explanations;
 *  otherwise it is a plain, non-interactive row. */
export function ReviewRow({ result: r }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const tricks = applicableTricks(r.question)
  const hasTricks = tricks.length > 0

  const content = (
    <>
      <span className={r.isCorrect ? 'text-success' : 'text-error'}>
        {r.isCorrect ? '✓' : '✗'}
      </span>
      <span className="flex-1 text-text">
        {r.question.prompt} = {r.question.answer}
        {hasTricks && (
          <span className="text-streak">
            {' · '}
            <span aria-hidden="true">💡 </span>
            {tricks.map((t) => t.name).join(', ')}
          </span>
        )}
      </span>
      {!r.isCorrect && (
        <span className="text-error">
          {r.givenAnswer === null ? 'skipped' : `you: ${r.givenAnswer}`}
        </span>
      )}
      <span className="text-dim">{(r.msToSubmit / 1000).toFixed(1)}s</span>
      <span className="w-3 text-dim" aria-hidden="true">
        {hasTricks ? (open ? '▾' : '▸') : ''}
      </span>
    </>
  )

  return (
    <div>
      {hasTricks ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`${ROW} transition-colors hover:bg-bg`}
        >
          {content}
        </button>
      ) : (
        <div className={ROW}>{content}</div>
      )}
      {open && (
        <div id={panelId} className="bg-bg px-3 py-3">
          {tricks.map((t) => (
            <TrickExplanation key={t.slug} trick={t} className="mb-3 last:mb-0" />
          ))}
        </div>
      )}
    </div>
  )
}
