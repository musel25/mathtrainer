import { describe, it, expect } from 'vitest'
import { generateQuestion, countCarries } from './questionGenerator'
import type { DifficultyBand } from './types'

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
