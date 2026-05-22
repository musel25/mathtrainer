import {
  useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import type { Question, QuestionResult } from '../lib/types'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'
import { TRICK_BY_SLUG } from '../lib/tricks'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { TrickExplanation } from './TrickExplanation'

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
  const sessionRef = useRef(session)

  // a miss (wrong answer or skip): the screen pauses on the explanation
  const missed = feedback !== null && feedback !== 'correct'

  // stamp the render time for each question — done in an effect, not during
  // render, so the component stays pure (react-hooks/purity)
  useEffect(() => {
    renderedAt.current = performance.now()
  }, [question])

  // live timer — stops updating once the question has been answered
  useEffect(() => {
    const id = setInterval(() => {
      if (!submittedRef.current) {
        setElapsed(performance.now() - renderedAt.current)
      }
    }, 100)
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

  // keep the latest session reachable from the keydown listener
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  function nextQuestion(updated: SessionState) {
    feedbackTimerRef.current = null
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

  // `value` is null for a skip ("I don't know").
  function submit(value: number | null) {
    const now = performance.now()
    const isCorrect = value !== null && value === question.answer
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
    if (isCorrect) {
      setFeedback('correct')
      // brief flash, then advance
      feedbackTimerRef.current = setTimeout(() => nextQuestion(updated), 350)
    } else if (value === null) {
      setFeedback(`skipped — answer ${question.answer}`)
    } else {
      setFeedback(`answer ${question.answer}`)
    }
    // a miss does not auto-advance — the user continues via the Next button
  }

  function skip() {
    if (submittedRef.current) return
    submittedRef.current = true
    submit(null)
  }

  function onChange(raw: string) {
    if (submittedRef.current) return
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now()
    }
    setInput(digits)
    // instant recognition: accept the moment the typed value is correct
    if (digits.length > 0 && Number(digits) === question.answer) {
      submittedRef.current = true
      submit(Number(digits))
    }
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      skip()
      return
    }
    if (e.key === 'Enter' && !submittedRef.current && input.length > 0) {
      submittedRef.current = true
      submit(Number(input))
    }
  }

  function handleNext() {
    nextQuestion(sessionRef.current)
  }

  // While paused on a miss, Enter/Space advances. Arming is deferred to a
  // later task: the keypress that submitted the answer is still propagating
  // when this effect runs, so an immediately-live listener would catch it and
  // skip the explanation.
  useEffect(() => {
    if (!missed) return
    let armed = false
    const armId = setTimeout(() => { armed = true }, 0)
    function advance(e: KeyboardEvent) {
      if (armed && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        handleNext()
      }
    }
    window.addEventListener('keydown', advance)
    return () => {
      clearTimeout(armId)
      window.removeEventListener('keydown', advance)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missed])

  const progress = `[${String(session.results.length + 1).padStart(2, '0')}`
    + `/${String(TOTAL).padStart(2, '0')}]`
  const seconds = (elapsed / 1000).toFixed(2)

  const inputBorder = feedback === 'correct'
    ? 'border-success'
    : feedback
      ? 'border-error'
      : 'border-accent'

  const trick = question.features.trickSlug
    ? TRICK_BY_SLUG[question.features.trickSlug]
    : undefined

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

      <div className="mt-2 flex h-7 items-center gap-3 font-mono text-xs text-dim">
        {feedback === null && (
          <>
            <span>type the answer</span>
            <button
              onClick={skip}
              className="rounded border border-border-strong px-2 py-0.5 text-dim
                transition-colors hover:border-error hover:text-error"
            >
              I don't know (Esc)
            </button>
          </>
        )}
      </div>

      <div aria-live="polite" className="mt-1 h-7 font-mono text-sm">
        {feedback === 'correct' && <span className="text-success">✓ correct</span>}
        {missed && <span className="text-error">✗ {feedback}</span>}
      </div>

      {feedback === 'correct' && trick && (
        <div className="mt-1 h-7 text-sm text-streak">💡 {trick.tip}</div>
      )}

      {missed && (
        <>
          {trick && (
            <Card className="mt-4 w-full max-w-[420px] p-4">
              <TrickExplanation trick={trick} />
            </Card>
          )}
          <Button
            variant="primary"
            onClick={handleNext}
            className="mt-4 px-6 py-2"
          >
            Next →
          </Button>
          <div className="mt-1 font-mono text-xs text-dim">
            press Enter or Space
          </div>
        </>
      )}
    </div>
  )
}
