import type {
  Dashboard, Operation, Progress, QuestionResult,
  SessionPlan, Settings, TrickStat,
} from './types'

export interface SessionSummary {
  session_id: number
  n_questions: number
  n_correct: number
  accuracy: number
  total_score: number
  rating_before: number
  rating_after: number
  weak_operations: string[]
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
    trick_slug: r.question.features.trickSlug,
    // placeholder — the backend computes the authoritative score via the model
    score: 0,
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

export async function getSessionPlan(): Promise<SessionPlan> {
  const resp = await fetch('/api/session-plan')
  if (!resp.ok) throw new Error(`getSessionPlan failed: ${resp.status}`)
  const raw = await resp.json()
  return {
    rating: raw.rating as number,
    targetBand: { min: raw.target_band.min, max: raw.target_band.max },
    weakOperations: raw.weak_operations as Operation[],
    sessionLength: raw.session_length as number,
  }
}

export async function getDashboard(): Promise<Dashboard> {
  const resp = await fetch('/api/dashboard')
  if (!resp.ok) throw new Error(`getDashboard failed: ${resp.status}`)
  const r = await resp.json()
  return {
    streak: r.streak,
    today: r.today,
    rating: r.rating,
    ratingSparkline: r.rating_sparkline,
    heatmap: r.heatmap,
    totalSessions: r.total_sessions,
  }
}

export async function getProgress(): Promise<Progress> {
  const resp = await fetch('/api/progress')
  if (!resp.ok) throw new Error(`getProgress failed: ${resp.status}`)
  const r = await resp.json()
  return {
    history: r.history,
    operationTimes: r.operation_times.map(
      (o: { operation: string; avg_ms: number }) => ({
        operation: o.operation, avgMs: o.avg_ms,
      }),
    ),
  }
}

export async function getSettings(): Promise<Settings> {
  const resp = await fetch('/api/settings')
  if (!resp.ok) throw new Error(`getSettings failed: ${resp.status}`)
  const r = await resp.json()
  return { dailyGoal: r.daily_goal, sessionLength: r.session_length }
}

export async function putSettings(s: Settings): Promise<void> {
  const resp = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      daily_goal: s.dailyGoal, session_length: s.sessionLength,
    }),
  })
  if (!resp.ok) throw new Error(`putSettings failed: ${resp.status}`)
}

export async function getTricks(): Promise<TrickStat[]> {
  const resp = await fetch('/api/tricks')
  if (!resp.ok) throw new Error(`getTricks failed: ${resp.status}`)
  const rows = await resp.json()
  return rows.map((r: {
    slug: string; attempts: number; correct: number;
    proficiency: number; last_practiced: string | null
  }) => ({
    slug: r.slug,
    attempts: r.attempts,
    correct: r.correct,
    proficiency: r.proficiency,
    lastPracticed: r.last_practiced,
  }))
}
