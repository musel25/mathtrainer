import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Question, QuestionResult } from '../lib/types'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'
import { TRICK_BY_SLUG } from '../lib/tricks'

interface Props {
  questionSource: () => Question
  total: number
  onComplete: (results: QuestionResult[]) => void
}

export function PracticeScreen({ questionSource, total, onComplete }: Props) {
  const TOTAL = total
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(() => questionSource())
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<null | 'correct' | string>(null)
  const [elapsed, setElapsed] = useState(0)
  const renderedAt = useRef(0)
  const firstKeyAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedRef = useRef(false)

  // stamp the render time for each question — done in an effect, not during
  // render, so the component stays pure (react-hooks/purity)
  useEffect(() => {
    renderedAt.current = performance.now()
  }, [question])

  // live timer
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(performance.now() - renderedAt.current),
      100,
    )
    return () => clearInterval(id)
  }, [question])

  // clear a pending feedback->advance timer if we unmount before it fires
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  // focus the input on every new question
  useEffect(() => {
    inputRef.current?.focus()
  }, [question])

  function nextQuestion(updated: SessionState) {
    if (isComplete(updated)) {
      onComplete(updated.results)
      return
    }
    setQuestion(questionSource())
    setInput('')
    setFeedback(null)
    firstKeyAt.current = null
    submittedRef.current = false
  }

  function submit(value: number) {
    const now = performance.now()
    const isCorrect = value === question.answer
    const result: QuestionResult = {
      question,
      givenAnswer: value,
      isCorrect,
      msToFirstKey: firstKeyAt.current
        ? Math.round(firstKeyAt.current - renderedAt.current)
        : null,
      msToSubmit: Math.round(now - renderedAt.current),
    }
    const updated = recordResult(session, result)
    setSession(updated)
    setFeedback(isCorrect ? 'correct' : `answer ${question.answer}`)
    // brief feedback pause, then advance
    feedbackTimerRef.current = setTimeout(
      () => nextQuestion(updated),
      isCorrect ? 350 : 1100,
    )
  }

  function onChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now()
    }
    setInput(digits)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !submittedRef.current && input.length > 0) {
      submittedRef.current = true
      submit(Number(input))
    }
  }

  const progress = `[${String(session.results.length + 1).padStart(2, '0')}`
    + `/${String(TOTAL).padStart(2, '0')}]`
  const seconds = (elapsed / 1000).toFixed(2)

  const inputBorder = feedback === 'correct'
    ? 'border-success'
    : feedback
      ? 'border-error'
      : 'border-accent'

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center px-4 pt-[15vh]">
      <div className="flex w-full max-w-[300px] items-center gap-2.5">
        <span className="font-mono text-xs text-success">{progress}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs text-muted">{seconds}s</span>
      </div>

      <div className="mt-9 font-mono text-[44px] font-bold tracking-wide text-text">
        {question.prompt} =
      </div>

      <input
        ref={inputRef}
        value={input}
        inputMode="numeric"
        aria-label="Your answer"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={feedback !== null}
        className={`mt-6 w-[200px] rounded-md border bg-surface px-4 py-2.5 text-center
          font-mono text-3xl text-text caret-accent outline-none transition-colors
          duration-100 focus:shadow-[0_0_0_3px_rgba(47,129,247,0.18)]
          disabled:opacity-70 ${inputBorder}`}
      />

      <div className="mt-2 h-4 font-mono text-xs text-dim">
        {feedback === null && 'press Enter'}
      </div>

      <div aria-live="polite" className="mt-1 h-7 font-mono text-sm">
        {feedback === 'correct' && <span className="text-success">✓ correct</span>}
        {feedback && feedback !== 'correct' && (
          <span className="text-error">✗ {feedback}</span>
        )}
      </div>

      <div className="mt-1 h-7 text-sm text-streak">
        {feedback !== null && question.features.trickSlug && (
          <span>💡 {TRICK_BY_SLUG[question.features.trickSlug]?.tip}</span>
        )}
      </div>
    </div>
  )
}
