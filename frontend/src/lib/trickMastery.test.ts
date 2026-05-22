import { describe, it, expect } from 'vitest'
import type { TrickStat } from './types'
import { masteryLevel, needsWork, categorySummary } from './trickMastery'

function stat(over: Partial<TrickStat>): TrickStat {
  return {
    slug: 'x', attempts: 10, correct: 5, proficiency: 0.5,
    lastPracticed: null, ...over,
  }
}

describe('masteryLevel', () => {
  it('is unpracticed with no stat or zero attempts', () => {
    expect(masteryLevel(undefined)).toBe('unpracticed')
    expect(masteryLevel(stat({ attempts: 0 }))).toBe('unpracticed')
  })

  it('classifies at the 0.6 and 0.85 boundaries', () => {
    expect(masteryLevel(stat({ proficiency: 0.59 }))).toBe('weak')
    expect(masteryLevel(stat({ proficiency: 0.6 }))).toBe('ok')
    expect(masteryLevel(stat({ proficiency: 0.84 }))).toBe('ok')
    expect(masteryLevel(stat({ proficiency: 0.85 }))).toBe('strong')
  })
})

describe('needsWork', () => {
  it('returns weak slugs sorted by proficiency ascending, capped at 5', () => {
    const stats: Record<string, TrickStat> = {
      a: stat({ slug: 'a', proficiency: 0.5 }),
      b: stat({ slug: 'b', proficiency: 0.1 }),
      c: stat({ slug: 'c', proficiency: 0.9 }), // strong — excluded
      d: stat({ slug: 'd', proficiency: 0.3 }),
      e: stat({ slug: 'e', proficiency: 0.55 }),
      f: stat({ slug: 'f', proficiency: 0.2 }),
      g: stat({ slug: 'g', proficiency: 0.4 }),
    }
    expect(needsWork(stats)).toEqual(['b', 'f', 'd', 'g', 'a'])
  })

  it('breaks proficiency ties by attempts descending', () => {
    const stats: Record<string, TrickStat> = {
      a: stat({ slug: 'a', proficiency: 0.3, attempts: 4 }),
      b: stat({ slug: 'b', proficiency: 0.3, attempts: 20 }),
    }
    expect(needsWork(stats)).toEqual(['b', 'a'])
  })
})

describe('categorySummary', () => {
  it('counts practised tricks and averages their proficiency', () => {
    const stats: Record<string, TrickStat> = {
      a: stat({ slug: 'a', attempts: 10, proficiency: 0.8 }),
      b: stat({ slug: 'b', attempts: 0, proficiency: 0 }),
      c: stat({ slug: 'c', attempts: 4, proficiency: 0.6 }),
    }
    expect(categorySummary(['a', 'b', 'c', 'd'], stats)).toEqual({
      practised: 2, total: 4, avgProficiency: 0.7,
    })
  })

  it('returns zero average when nothing is practised', () => {
    expect(categorySummary(['a', 'b'], {})).toEqual({
      practised: 0, total: 2, avgProficiency: 0,
    })
  })
})
