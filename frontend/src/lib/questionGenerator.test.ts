import { describe, it, expect } from 'vitest'
import { generateQuestion, countCarries } from './questionGenerator'
import { TRICK_BY_SLUG } from './tricks'
import type { DifficultyBand, Operation } from './types'

const BAND: DifficultyBand = { min: 15, max: 55 }

describe('countCarries', () => {
  it('counts zero carries for 12 + 34', () => {
    expect(countCarries(12, 34)).toBe(0)
  })
  it('counts a carry for 19 + 5', () => {
    expect(countCarries(19, 5)).toBe(1)
  })
})

describe('generateQuestion', () => {
  it('produces a question whose answer is correct for the operation', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      let expected: number
      switch (q.operation) {
        case 'add': expected = q.operands[0] + q.operands[1]; break
        case 'subtract': expected = q.operands[0] - q.operands[1]; break
        case 'multiply': expected = q.operands[0] * q.operands[1]; break
        case 'divide': expected = q.operands[0] / q.operands[1]; break
        case 'square': expected = q.operands[0] * q.operands[0]; break
        case 'percent': expected = (q.operands[0] / 100) * q.operands[1]; break
      }
      expect(q.answer).toBe(expected)
    }
  })

  it('always yields integer, non-negative answers', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      expect(Number.isInteger(q.answer)).toBe(true)
      expect(q.answer).toBeGreaterThanOrEqual(0)
    }
  })

  it('never produces a subtraction with a negative result', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      if (q.operation === 'subtract') {
        expect(q.operands[0]).toBeGreaterThanOrEqual(q.operands[1])
      }
    }
  })

  it('lands difficulty inside the band (allowing a small tolerance)', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      expect(q.difficulty).toBeGreaterThanOrEqual(BAND.min - 10)
      expect(q.difficulty).toBeLessThanOrEqual(BAND.max + 10)
    }
  })
})

describe('generateQuestion trick tagging', () => {
  it('tags a question when a trick applies', () => {
    let tagged = 0
    for (let i = 0; i < 600; i++) {
      const q = generateQuestion({ min: 1, max: 100 }, Math.random, { multiply: 5 })
      if (q.features.trickSlug !== null) {
        tagged++
      }
    }
    expect(tagged).toBeGreaterThan(0)
  })

  it('never tags a question with a trick that does not apply', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion({ min: 1, max: 100 })
      if (q.features.trickSlug !== null) {
        const trick = TRICK_BY_SLUG[q.features.trickSlug]
        expect(trick).toBeDefined()
        expect(trick.applies(q)).toBe(true)
      }
    }
  })
})

describe('generateQuestion operation weighting', () => {
  it('over-samples operations with a low rating', () => {
    const ratings: Record<Operation, number> = {
      add: 5, subtract: 100, multiply: 100,
      divide: 100, square: 100, percent: 100,
    }
    const counts: Record<string, number> = {}
    for (let i = 0; i < 3000; i++) {
      const q = generateQuestion(BAND, Math.random, ratings)
      counts[q.operation] = (counts[q.operation] ?? 0) + 1
    }
    expect(counts.add).toBeGreaterThan((counts.subtract ?? 0) * 3)
  })

  it('still reaches every operation when ratings are equal', () => {
    const ratings: Record<Operation, number> = {
      add: 50, subtract: 50, multiply: 50,
      divide: 50, square: 50, percent: 50,
    }
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      seen.add(generateQuestion(BAND, Math.random, ratings).operation)
    }
    expect(seen.size).toBe(6)
  })
})
