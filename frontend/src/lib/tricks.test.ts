import { describe, it, expect } from 'vitest'
import { TRICKS, TRICK_BY_SLUG, detectTrick } from './tricks'

describe('trick library', () => {
  it('every trick has the required fields', () => {
    for (const t of TRICKS) {
      expect(t.slug).toBeTruthy()
      expect(t.name).toBeTruthy()
      expect(t.lesson.length).toBeGreaterThan(20)
      expect(t.tip.length).toBeGreaterThan(5)
    }
  })

  it('TRICK_BY_SLUG indexes every trick', () => {
    for (const t of TRICKS) {
      expect(TRICK_BY_SLUG[t.slug]).toBe(t)
    }
  })

  it("each trick's generate() produces a question it applies to", () => {
    for (const t of TRICKS) {
      for (let i = 0; i < 100; i++) {
        const q = t.generate(Math.random)
        expect(t.applies(q)).toBe(true)
        expect(q.features.trickSlug).toBe(t.slug)
        expect(q.answer).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(q.answer)).toBe(true)
      }
    }
  })

  it('detectTrick finds an applicable trick and returns null otherwise', () => {
    const times11 = TRICK_BY_SLUG['times-11'].generate(Math.random)
    expect(detectTrick(times11)).toBe('times-11')
    expect(detectTrick({ operation: 'add', operands: [12, 34] })).toBeNull()
  })
})

describe('multiplication shortcuts ×3 ×6 ×7', () => {
  it('registers times-3, times-6, times-7 and detects them', () => {
    expect(TRICK_BY_SLUG['times-3']).toBeTruthy()
    expect(TRICK_BY_SLUG['times-6']).toBeTruthy()
    expect(TRICK_BY_SLUG['times-7']).toBeTruthy()
    expect(detectTrick({ operation: 'multiply', operands: [26, 3] })).toBe('times-3')
    expect(detectTrick({ operation: 'multiply', operands: [23, 6] })).toBe('times-6')
    expect(detectTrick({ operation: 'multiply', operands: [18, 7] })).toBe('times-7')
  })

  it('generates correct products', () => {
    for (const slug of ['times-3', 'times-6', 'times-7']) {
      const t = TRICK_BY_SLUG[slug]
      for (let i = 0; i < 50; i++) {
        const q = t.generate(Math.random)
        const [a, b] = q.operands
        expect(q.answer).toBe(a * b)
      }
    }
  })
})

describe('general methods are excluded from detectTrick', () => {
  it('mult-2digit-crisscross is registered as a general method', () => {
    const t = TRICK_BY_SLUG['mult-2digit-crisscross']
    expect(t).toBeTruthy()
    expect(t.autoDetect).toBe(false)
  })

  it('detectTrick skips general methods', () => {
    // 23 × 41 matches no auto-detected trick; only the general
    // crisscross method applies, and it must be skipped.
    expect(detectTrick({ operation: 'multiply', operands: [23, 41] })).toBeNull()
  })

  it('detectTrick still resolves auto-detected shortcuts', () => {
    expect(detectTrick({ operation: 'multiply', operands: [47, 11] })).toBe('times-11')
  })
})
