import type { Operation, Question } from './types'
import { computeDifficulty } from './difficulty'

export interface Trick {
  slug: string
  name: string
  lesson: string
  tip: string
  applies: (q: Pick<Question, 'operation' | 'operands'>) => boolean
  generate: (rng: () => number) => Question
}

function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** Builds a complete trick-applicable Question (operations with no carries). */
function makeQuestion(
  operation: Operation,
  operands: number[],
  prompt: string,
  answer: number,
  slug: string,
): Question {
  const features = {
    operation,
    maxOperand: Math.max(...operands),
    carries: 0,
    trickSlug: slug,
  }
  return {
    operation,
    operands,
    prompt,
    answer,
    features,
    difficulty: computeDifficulty(features),
  }
}

export const TRICKS: Trick[] = [
  {
    slug: 'times-11',
    name: 'Multiply by 11',
    lesson:
      'To multiply a two-digit number by 11, add its two digits and place ' +
      'the sum between them.\n\nExample: 35 × 11 → 3 _(3+5)_ 5 → 385.\n' +
      'If the digit sum is 10 or more, carry the 1 into the left digit.',
    tip: '×11: add the two digits, drop the sum in the middle.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(11),
    generate: (rng) => {
      const a = randInt(rng, 10, 99)
      return makeQuestion('multiply', [a, 11], `${a} × 11`, a * 11, 'times-11')
    },
  },
  {
    slug: 'squares-ending-5',
    name: 'Square a number ending in 5',
    lesson:
      'To square a number ending in 5, take the tens part n, compute ' +
      'n × (n + 1), and append 25.\n\nExample: 35² → 3 × 4 = 12 → 1225.',
    tip: 'n5²: n×(n+1), then stick 25 on the end.',
    applies: (q) => q.operation === 'square' && q.operands[0] % 10 === 5,
    generate: (rng) => {
      const a = pick(rng, [15, 25, 35, 45, 55, 65, 75, 85, 95])
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-ending-5')
    },
  },
  {
    slug: 'times-5',
    name: 'Multiply by 5',
    lesson:
      'Multiplying by 5 is the same as multiplying by 10 and halving.\n\n' +
      'Example: 48 × 5 → 480 ÷ 2 = 240.',
    tip: '×5: multiply by 10, then halve.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(5),
    generate: (rng) => {
      const a = randInt(rng, 12, 99)
      return makeQuestion('multiply', [a, 5], `${a} × 5`, a * 5, 'times-5')
    },
  },
  {
    slug: 'times-9',
    name: 'Multiply by 9',
    lesson:
      'Multiplying by 9 is the same as multiplying by 10 and subtracting ' +
      'the number once.\n\nExample: 27 × 9 → 270 − 27 = 243.',
    tip: '×9: multiply by 10, then subtract the number.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(9),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 9], `${a} × 9`, a * 9, 'times-9')
    },
  },
  {
    slug: 'percent-swap',
    name: 'Swap the percentage',
    lesson:
      'x% of y always equals y% of x — swap them to make the sum easier.\n\n' +
      'Example: 8% of 50 is awkward, but 50% of 8 = 4. Same answer.',
    tip: 'x% of y = y% of x — swap to whichever is easier.',
    applies: (q) => q.operation === 'percent',
    generate: (rng) => {
      const pct = pick(rng, [5, 10, 20, 25, 50])
      const base = randInt(rng, 1, 20) * (100 / pct)
      return makeQuestion(
        'percent', [pct, base], `${pct}% of ${base}`,
        (pct / 100) * base, 'percent-swap',
      )
    },
  },
]

export const TRICK_BY_SLUG: Record<string, Trick> = Object.fromEntries(
  TRICKS.map((t) => [t.slug, t]),
)

/** The slug of the first trick that applies to a question, or null. */
export function detectTrick(
  q: Pick<Question, 'operation' | 'operands'>,
): string | null {
  for (const t of TRICKS) {
    if (t.applies(q)) return t.slug
  }
  return null
}
