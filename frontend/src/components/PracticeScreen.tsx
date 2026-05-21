import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Question, QuestionResult, SessionPlan } from '../lib/types'
import { generateQuestion } from '../lib/questionGenerator'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'

interface Props {
  plan: SessionPlan
  onComplete: (results: QuestionResult[]) => void
}

export function PracticeScreen({ plan, onComplete }: Props) {
  const TOTAL = plan.sessionLength
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(
    () => generateQuestion(plan.targetBand, Math.random, plan.weakOperations),
  )
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<null | 'correct' | string>(null)
  const [elapsed, setElapsed] = useState(0)
  const renderedAt = useRef(performance.now())
  const firstKeyAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedRef = useRef(false)

  const expectedLen = useMemo(() => String(question.answer).length, [question])

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
    setQuestion(generateQuestion(plan.targetBand, Math.random, plan.weakOperations))
    setInput('')
    setFeedback(null)
    firstKeyAt.current = null
    submittedRef.current = false
    renderedAt.current = performance.now()
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
    setFeedback(isCorrect ? 'correct' : `Answer: ${question.answer}`)
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
    if (!submittedRef.current && digits.length >= expectedLen) {
      submittedRef.current = true
      submit(Number(digits))
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !submittedRef.current && input.length > 0) {
      submittedRef.current = true
      submit(Number(input))
    }
  }

  const progress = `${session.results.length + 1} / ${TOTAL}`
  const seconds = (elapsed / 1000).toFixed(1)

  return (
    <div style={{ textAlign: 'center', marginTop: '14vh' }}>
      <div style={{ color: '#888' }}>{progress} &middot; {seconds}s</div>
      <div style={{ fontSize: 56, margin: '24px 0' }}>{question.prompt}</div>
      <input
        ref={inputRef}
        value={input}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={feedback !== null}
        style={{ fontSize: 40, width: 180, textAlign: 'center' }}
      />
      <div style={{ height: 40, marginTop: 16, fontSize: 24 }}>
        {feedback === 'correct' && <span style={{ color: 'green' }}>✓</span>}
        {feedback && feedback !== 'correct' && (
          <span style={{ color: 'crimson' }}>{feedback}</span>
        )}
      </div>
    </div>
  )
}
