import type { DifficultyBand, Operation, Question } from './types'
import { computeDifficulty } from './difficulty'
import { detectTrick } from './tricks'

type Rng = () => number

const OPERATIONS: Operation[] = [
  'add', 'subtract', 'multiply', 'divide', 'square', 'percent',
]

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** Counts decimal carries when adding two non-negative integers. */
export function countCarries(a: number, b: number): number {
  let carry = 0
  let carries = 0
  while (a > 0 || b > 0) {
    const sum = (a % 10) + (b % 10) + carry
    if (sum >= 10) {
      carries++
      carry = 1
    } else {
      carry = 0
    }
    a = Math.floor(a / 10)
    b = Math.floor(b / 10)
  }
  return carries
}

/** Builds one raw question for the given operation. */
function buildRaw(rng: Rng, op: Operation): Omit<Question, 'difficulty'> {
  let operands: number[]
  let answer: number
  let prompt: string
  let carries = 0

  switch (op) {
    case 'add': {
      const a = randInt(rng, 2, 999)
      const b = randInt(rng, 2, 999)
      operands = [a, b]
      answer = a + b
      carries = countCarries(a, b)
      prompt = `${a} + ${b}`
      break
    }
    case 'subtract': {
      const a = randInt(rng, 2, 999)
      const b = randInt(rng, 2, a) // ensures non-negative result
      operands = [a, b]
      answer = a - b
      carries = countCarries(a - b, b) // borrows ≈ carries of the reverse add
      prompt = `${a} − ${b}`
      break
    }
    case 'multiply': {
      const a = randInt(rng, 2, 99)
      const b = randInt(rng, 2, 19)
      operands = [a, b]
      answer = a * b
      prompt = `${a} × ${b}`
      break
    }
    case 'divide': {
      // generate answer-first so division is always exact
      const quotient = randInt(rng, 2, 99)
      const divisor = randInt(rng, 2, 19)
      const dividend = quotient * divisor
      operands = [dividend, divisor]
      answer = quotient
      prompt = `${dividend} ÷ ${divisor}`
      break
    }
    case 'square': {
      const a = randInt(rng, 2, 40)
      operands = [a]
      answer = a * a
      prompt = `${a}²`
      break
    }
    case 'percent': {
      // pick a percentage and base that yield an integer result
      const pct = pick(rng, [5, 10, 20, 25, 50])
      const base = randInt(rng, 1, 20) * (100 / pct)
      operands = [pct, base]
      answer = (pct / 100) * base
      prompt = `${pct}% of ${base}`
      break
    }
  }

  return {
    operation: op,
    operands,
    prompt,
    answer,
    features: { operation: op, maxOperand: Math.max(...operands), carries, trickSlug: null },
  }
}

/**
 * Generates a question whose difficulty falls inside `band`. Uses bounded
 * rejection sampling; if no candidate lands in the band within the retry
 * budget, returns the closest one found. Operations listed in `weakOps` are
 * over-sampled (entered twice into the operation pool). `rng` is injectable
 * for testing.
 */
export function generateQuestion(
  band: DifficultyBand,
  rng: Rng = Math.random,
  weakOps: Operation[] = [],
): Question {
  const MAX_TRIES = 40
  const pool: Operation[] = [...OPERATIONS, ...weakOps]
  let best: Question | null = null
  let bestDist = Infinity

  for (let i = 0; i < MAX_TRIES; i++) {
    const raw = buildRaw(rng, pick(rng, pool))
    raw.features.trickSlug = detectTrick(raw)
    const difficulty = computeDifficulty(raw.features)
    const candidate: Question = { ...raw, difficulty }

    if (difficulty >= band.min && difficulty <= band.max) {
      return candidate
    }
    const dist = difficulty < band.min
      ? band.min - difficulty
      : difficulty - band.max
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  return best as Question
}
