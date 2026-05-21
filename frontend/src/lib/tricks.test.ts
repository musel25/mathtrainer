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
