import type { QuestionResult } from './types'

export interface SessionSummary {
  session_id: number
  n_questions: number
  n_correct: number
  accuracy: number
  total_score: number
}

interface AttemptPayload {
  operation: string
  operands: number[]
  correct_answer: number
  given_answer: number | null
  is_correct: boolean
  difficulty: number
  features: Record<string, unknown>
  ms_to_first_key: number | null
  ms_to_submit: number
  trick_slug: string | null
  score: number
}

function toPayload(r: QuestionResult): AttemptPayload {
  return {
    operation: r.question.operation,
    operands: r.question.operands,
    correct_answer: r.question.answer,
    given_answer: r.givenAnswer,
    is_correct: r.isCorrect,
    difficulty: r.question.difficulty,
    features: r.question.features as unknown as Record<string, unknown>,
    ms_to_first_key: r.msToFirstKey,
    ms_to_submit: r.msToSubmit,
    trick_slug: null,
    score: r.isCorrect ? r.question.difficulty : 0,
  }
}

export async function startSession(mode = 'daily'): Promise<number> {
  const resp = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!resp.ok) throw new Error(`startSession failed: ${resp.status}`)
  return (await resp.json()).id as number
}

export async function finishSession(
  sessionId: number,
  results: QuestionResult[],
): Promise<SessionSummary> {
  const resp = await fetch(`/api/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempts: results.map(toPayload) }),
  })
  if (!resp.ok) throw new Error(`finishSession failed: ${resp.status}`)
  return (await resp.json()) as SessionSummary
}
