import type { TrickStat } from './types'

export type MasteryLevel = 'unpracticed' | 'weak' | 'ok' | 'strong'

/** Proficiency (0..1) below this is "weak". */
export const WEAK_THRESHOLD = 0.6
/** Proficiency (0..1) at or above this is "strong". */
export const STRONG_THRESHOLD = 0.85
/** Maximum number of tricks shown in the "Needs work" section. */
export const NEEDS_WORK_LIMIT = 5

/** Classifies a trick's mastery from its accumulated stats. */
export function masteryLevel(stat: TrickStat | undefined): MasteryLevel {
  if (!stat || stat.attempts === 0) return 'unpracticed'
  if (stat.proficiency < WEAK_THRESHOLD) return 'weak'
  if (stat.proficiency < STRONG_THRESHOLD) return 'ok'
  return 'strong'
}

/**
 * Slugs of the weakest practised tricks, worst first. Ties on proficiency
 * are broken by attempt count (more attempts first). Capped at
 * NEEDS_WORK_LIMIT.
 */
export function needsWork(stats: Record<string, TrickStat>): string[] {
  return Object.values(stats)
    .filter((s) => masteryLevel(s) === 'weak')
    .sort((a, b) => a.proficiency - b.proficiency || b.attempts - a.attempts)
    .slice(0, NEEDS_WORK_LIMIT)
    .map((s) => s.slug)
}

export interface CategorySummary {
  practised: number
  total: number
  avgProficiency: number
}

/**
 * Summarizes a category: how many of its tricks have been practised, the
 * total, and the average proficiency over the practised ones (0 if none).
 */
export function categorySummary(
  slugs: string[],
  stats: Record<string, TrickStat>,
): CategorySummary {
  const practised = slugs
    .map((s) => stats[s])
    .filter((s): s is TrickStat => !!s && s.attempts > 0)
  const avgProficiency = practised.length
    ? practised.reduce((sum, s) => sum + s.proficiency, 0) / practised.length
    : 0
  return { practised: practised.length, total: slugs.length, avgProficiency }
}
