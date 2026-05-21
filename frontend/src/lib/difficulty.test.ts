import { describe, it, expect } from 'vitest'
import { computeDifficulty } from './difficulty'
import type { QuestionFeatures } from './types'

const base = (over: Partial<QuestionFeatures>): QuestionFeatures => ({
  operation: 'add', maxOperand: 10, carries: 0, trickSlug: null, ...over,
})

describe('computeDifficulty', () => {
  it('returns a value clamped to 1..100', () => {
    const d = computeDifficulty(base({ operation: 'add', maxOperand: 5 }))
    expect(d).toBeGreaterThanOrEqual(1)
    expect(d).toBeLessThanOrEqual(100)
  })

  it('rates multiplication harder than addition for the same operands', () => {
    const add = computeDifficulty(base({ operation: 'add', maxOperand: 50 }))
    const mul = computeDifficulty(base({ operation: 'multiply', maxOperand: 50 }))
    expect(mul).toBeGreaterThan(add)
  })

  it('rates larger operands harder', () => {
    const small = computeDifficulty(base({ maxOperand: 10 }))
    const large = computeDifficulty(base({ maxOperand: 900 }))
    expect(large).toBeGreaterThan(small)
  })

  it('adds difficulty for carries', () => {
    const none = computeDifficulty(base({ carries: 0 }))
    const some = computeDifficulty(base({ carries: 3 }))
    expect(some).toBeGreaterThan(none)
  })

  it('reduces difficulty when a trick applies', () => {
    const plain = computeDifficulty(base({ operation: 'multiply', trickSlug: null }))
    const trick = computeDifficulty(base({ operation: 'multiply', trickSlug: 'times-11' }))
    expect(trick).toBeLessThan(plain)
  })
})
