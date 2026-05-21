import type { QuestionResult } from './types'

export interface SessionState {
  total: number
  results: QuestionResult[]
}

export interface SessionStats {
  answered: number
  correct: number
  accuracy: number
  totalScore: number
  avgMsToSubmit: number
}

export function createSession(total: number): SessionState {
  return { total, results: [] }
}

/** Phase 1 scoring: difficulty for a correct answer, 0 otherwise. */
export function scoreResult(result: QuestionResult): number {
  return result.isCorrect ? result.question.difficulty : 0
}

/** Returns a new state with `result` appended (does not mutate `state`). */
export function recordResult(
  state: SessionState,
  result: QuestionResult,
): SessionState {
  return { total: state.total, results: [...state.results, result] }
}

export function isComplete(state: SessionState): boolean {
  return state.results.length >= state.total
}

export function sessionStats(state: SessionState): SessionStats {
  const answered = state.results.length
  const correct = state.results.filter((r) => r.isCorrect).length
  const totalScore = state.results.reduce((sum, r) => sum + scoreResult(r), 0)
  const totalMs = state.results.reduce((sum, r) => sum + r.msToSubmit, 0)
  return {
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    totalScore,
    avgMsToSubmit: answered ? Math.round(totalMs / answered) : 0,
  }
}
