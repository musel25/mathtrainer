import type { Operation, QuestionFeatures } from './types'

const OP_BASE: Record<Operation, number> = {
  add: 8,
  subtract: 12,
  multiply: 20,
  divide: 24,
  square: 22,
  percent: 18,
}

/**
 * Hand-designed v1 difficulty formula. Pure function of question features.
 * Output is clamped to 1..100. See spec; Phase 5 may refit this from data.
 */
export function computeDifficulty(f: QuestionFeatures): number {
  const sizeTerm = 6 * Math.log2(f.maxOperand + 1)
  const carryTerm = 7 * f.carries
  const trickRelief = f.trickSlug ? -6 : 0
  const raw = OP_BASE[f.operation] + sizeTerm + carryTerm + trickRelief
  return Math.max(1, Math.min(100, Math.round(raw)))
}
