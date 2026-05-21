import { describe, it, expect } from 'vitest'
import { createSession, recordResult, isComplete, sessionStats, scoreResult } from './session'
import type { Question, QuestionResult } from './types'

const q = (difficulty: number): Question => ({
  operation: 'add', operands: [1, 2], prompt: '1 + 2', answer: 3,
  features: { operation: 'add', maxOperand: 2, carries: 0, trickSlug: null },
  difficulty,
})

const result = (difficulty: number, isCorrect: boolean): QuestionResult => ({
  question: q(difficulty), givenAnswer: isCorrect ? 3 : 9, isCorrect,
  msToFirstKey: 500, msToSubmit: 2000,
})

describe('session state machine', () => {
  it('starts empty and not complete', () => {
    const s = createSession(3)
    expect(s.results).toHaveLength(0)
    expect(isComplete(s)).toBe(false)
  })

  it('records results immutably', () => {
    const s0 = createSession(2)
    const s1 = recordResult(s0, result(20, true))
    expect(s0.results).toHaveLength(0)
    expect(s1.results).toHaveLength(1)
  })

  it('is complete once total results are recorded', () => {
    let s = createSession(2)
    s = recordResult(s, result(20, true))
    expect(isComplete(s)).toBe(false)
    s = recordResult(s, result(20, false))
    expect(isComplete(s)).toBe(true)
  })

  it('scores a correct answer as its difficulty and a wrong answer as 0', () => {
    expect(scoreResult(result(30, true))).toBe(30)
    expect(scoreResult(result(30, false))).toBe(0)
  })

  it('computes session stats', () => {
    let s = createSession(2)
    s = recordResult(s, result(30, true))
    s = recordResult(s, result(10, false))
    const stats = sessionStats(s)
    expect(stats.answered).toBe(2)
    expect(stats.correct).toBe(1)
    expect(stats.accuracy).toBe(0.5)
    expect(stats.totalScore).toBe(30)
    expect(stats.avgMsToSubmit).toBe(2000)
  })
})
