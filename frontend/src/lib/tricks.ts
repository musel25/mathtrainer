import type { Operation, Question } from './types'
import { computeDifficulty } from './difficulty'

export type TrickCategory =
  | 'multiplication'
  | 'squaring'
  | 'division'
  | 'addition-subtraction'
  | 'percentages'

export interface Trick {
  slug: string
  name: string
  category: TrickCategory
  lesson: string
  tip: string
  applies: (q: Pick<Question, 'operation' | 'operands'>) => boolean
  generate: (rng: () => number) => Question
}

/** Display metadata for the Tricks page, in the order categories appear. */
export const CATEGORY_META: { id: TrickCategory; label: string }[] = [
  { id: 'multiplication', label: 'Multiplication' },
  { id: 'squaring', label: 'Squaring' },
  { id: 'division', label: 'Division' },
  { id: 'addition-subtraction', label: 'Addition & Subtraction' },
  { id: 'percentages', label: 'Percentages' },
]

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
  // ─── Multiplication ────────────────────────────────────────────────────
  {
    slug: 'times-11',
    name: 'Multiply by 11',
    category: 'multiplication',
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
    slug: 'times-5',
    name: 'Multiply by 5',
    category: 'multiplication',
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
    category: 'multiplication',
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
    slug: 'times-12',
    name: 'Multiply by 12',
    category: 'multiplication',
    lesson:
      'To multiply by 12, break 12 into 10 + 2: multiply the number by 10, ' +
      'then add double the number.\n\n' +
      'Example: 34 × 12 → 340 + 68 = 408.',
    tip: '×12: ten times the number plus twice the number.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(12),
    generate: (rng) => {
      const a = randInt(rng, 13, 99)
      return makeQuestion('multiply', [a, 12], `${a} × 12`, a * 12, 'times-12')
    },
  },
  {
    slug: 'times-15',
    name: 'Multiply by 15',
    category: 'multiplication',
    lesson:
      'Multiplying by 15 = multiplying by 10 and adding half again (×1.5).\n\n' +
      'Example: 24 × 15 → 240 + 120 = 360.\n' +
      'Multiply by 10 (240), then add half of 240 (120) → 360.',
    tip: '×15: ×10 then add half the result.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(15),
    generate: (rng) => {
      const a = randInt(rng, 6, 49) * 2
      return makeQuestion('multiply', [a, 15], `${a} × 15`, a * 15, 'times-15')
    },
  },
  {
    slug: 'times-25',
    name: 'Multiply by 25',
    category: 'multiplication',
    lesson:
      '25 = 100 ÷ 4, so multiplying by 25 means multiplying by 100 and ' +
      'then dividing by 4 (halve twice).\n\n' +
      'Example: 36 × 25 → 3600 ÷ 4 = 900.',
    tip: '×25: ×100 then divide by 4 (halve twice).',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(25),
    generate: (rng) => {
      const a = randInt(rng, 2, 24) * 4
      return makeQuestion('multiply', [a, 25], `${a} × 25`, a * 25, 'times-25')
    },
  },
  {
    slug: 'times-4-double',
    name: 'Multiply by 4 (double twice)',
    category: 'multiplication',
    lesson:
      'Multiplying by 4 is the same as doubling twice.\n\n' +
      'Example: 37 × 4 → double 37 = 74, double again = 148.',
    tip: '×4: double, then double again.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(4),
    generate: (rng) => {
      const a = randInt(rng, 13, 99)
      return makeQuestion('multiply', [a, 4], `${a} × 4`, a * 4, 'times-4-double')
    },
  },
  {
    slug: 'times-8-double',
    name: 'Multiply by 8 (double three times)',
    category: 'multiplication',
    lesson:
      'Multiplying by 8 is the same as doubling three times.\n\n' +
      'Example: 23 × 8 → 46 → 92 → 184.',
    tip: '×8: double, double again, then double once more.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(8),
    generate: (rng) => {
      const a = randInt(rng, 11, 50)
      return makeQuestion('multiply', [a, 8], `${a} × 8`, a * 8, 'times-8-double')
    },
  },
  {
    slug: 'times-50',
    name: 'Multiply by 50',
    category: 'multiplication',
    lesson:
      '50 = 100 ÷ 2, so multiplying by 50 means multiplying by 100 and ' +
      'then halving.\n\n' +
      'Example: 74 × 50 → 7400 ÷ 2 = 3700.',
    tip: '×50: ×100 then halve.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(50),
    generate: (rng) => {
      const a = randInt(rng, 6, 49) * 2
      return makeQuestion('multiply', [a, 50], `${a} × 50`, a * 50, 'times-50')
    },
  },
  {
    slug: 'times-99',
    name: 'Multiply by 99',
    category: 'multiplication',
    lesson:
      '99 = 100 − 1, so multiply by 100 and subtract the number once.\n\n' +
      'Example: 47 × 99 → 4700 − 47 = 4653.',
    tip: '×99: ×100 then subtract the number.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(99),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 99], `${a} × 99`, a * 99, 'times-99')
    },
  },
  {
    slug: 'times-101',
    name: 'Multiply by 101',
    category: 'multiplication',
    lesson:
      '101 = 100 + 1, so multiply by 100 and add the number once.\n\n' +
      'Example: 34 × 101 → 3400 + 34 = 3434.\n' +
      'For two-digit numbers the answer is simply the number written twice.',
    tip: '×101: ×100 then add the number (two-digit numbers repeat).',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(101),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 101], `${a} × 101`, a * 101, 'times-101')
    },
  },
  {
    slug: 'times-125',
    name: 'Multiply by 125',
    category: 'multiplication',
    lesson:
      '125 = 1000 ÷ 8, so multiply by 1000 then divide by 8 (halve three ' +
      'times).\n\nExample: 24 × 125 → 24000 ÷ 8 = 3000.',
    tip: '×125: ×1000 then divide by 8 (halve three times).',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(125),
    generate: (rng) => {
      const a = randInt(rng, 1, 15) * 8
      return makeQuestion('multiply', [a, 125], `${a} × 125`, a * 125, 'times-125')
    },
  },
  {
    slug: 'near-100',
    name: 'Both factors near 100',
    category: 'multiplication',
    lesson:
      'When both numbers are close to 100, find each gap below 100.\n' +
      'Left part: either number minus the other number\'s gap.\n' +
      'Right part: the two gaps multiplied (pad to two digits).\n\n' +
      'Example: 97 × 96 → gaps 3 and 4.\n' +
      'Left: 97 − 4 = 93.  Right: 3 × 4 = 12.  Answer: 9312.',
    tip: 'Near 100: subtract each gap from the other factor, append gap×gap.',
    applies: (q) =>
      q.operation === 'multiply' &&
      q.operands.length === 2 &&
      q.operands[0] >= 90 && q.operands[0] <= 99 &&
      q.operands[1] >= 90 && q.operands[1] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 90, 99)
      const b = randInt(rng, 90, 99)
      return makeQuestion('multiply', [a, b], `${a} × ${b}`, a * b, 'near-100')
    },
  },
  {
    slug: 'diff-of-squares',
    name: 'Difference of squares',
    category: 'multiplication',
    lesson:
      'When two numbers are the same distance from a round number c, use ' +
      'the identity (c − d)(c + d) = c² − d².\n\n' +
      'Example: 47 × 53 → centre 50, offset 3.\n' +
      '50² − 3² = 2500 − 9 = 2491.',
    tip: 'Equidistant from a round number? Use c² − d² instead.',
    applies: (q) => {
      if (q.operation !== 'multiply' || q.operands.length !== 2) return false
      const [a, b] = q.operands
      const center = (a + b) / 2
      if (!Number.isInteger(center)) return false
      const d = center - a
      return b - center === d && center % 5 === 0 && d > 0
    },
    generate: (rng) => {
      const center = pick(rng, [20, 25, 30, 40, 50, 60, 70, 80, 100])
      const maxD = Math.min(center - 10, 9)
      const d = randInt(rng, 1, maxD)
      const a = center - d
      const b = center + d
      return makeQuestion('multiply', [a, b], `${a} × ${b}`, a * b, 'diff-of-squares')
    },
  },
  {
    slug: 'double-and-halve',
    name: 'Double and halve',
    category: 'multiplication',
    lesson:
      'If one factor is even, halve it and double the other — the product ' +
      'stays the same. Repeat until one factor is easy to multiply.\n\n' +
      'Example: 16 × 35 → 8 × 70 → 4 × 140 → 560.',
    tip: 'One factor even? Halve it, double the other — keep going.',
    applies: (q) => {
      if (q.operation !== 'multiply' || q.operands.length !== 2) return false
      const [a, b] = q.operands
      const oneMul4 = a % 4 === 0 || b % 4 === 0
      const oneOdd = a % 2 === 1 || b % 2 === 1
      return oneMul4 && oneOdd && a > 1 && b > 1
    },
    generate: (rng) => {
      const even = pick(rng, [12, 16, 24, 28, 32])
      const odd = pick(rng, [3, 7, 13, 17, 19, 23])
      return makeQuestion(
        'multiply', [even, odd], `${even} × ${odd}`, even * odd, 'double-and-halve',
      )
    },
  },

  // ─── Squaring ──────────────────────────────────────────────────────────
  {
    slug: 'squares-ending-5',
    name: 'Square a number ending in 5',
    category: 'squaring',
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
    slug: 'squares-ending-1',
    name: 'Square a number ending in 1',
    category: 'squaring',
    lesson:
      'A number ending in 1 is one more than a multiple of 10.\n' +
      'Use: (n + 1)² = n² + n + (n + 1), where n is the multiple of 10 ' +
      'just below.\n\n' +
      'Example: 41² → n = 40 → 1600 + 40 + 41 = 1681.',
    tip: 'Ends in 1: n² + n + (n+1) where n is the round ten below.',
    applies: (q) =>
      q.operation === 'square' &&
      q.operands[0] % 10 === 1 &&
      q.operands[0] >= 11 && q.operands[0] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 1, 9) * 10 + 1
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-ending-1')
    },
  },
  {
    slug: 'squares-ending-9',
    name: 'Square a number ending in 9',
    category: 'squaring',
    lesson:
      'A number ending in 9 is one less than a multiple of 10.\n' +
      'Use: a² = (a + 1)² − (a + 1) − a, where (a + 1) is the round ten ' +
      'just above.\n\n' +
      'Example: 49² → 50² − 50 − 49 = 2500 − 99 = 2401.',
    tip: 'Ends in 9: (a+1)² − (a+1) − a, stepping up to the round ten.',
    applies: (q) =>
      q.operation === 'square' &&
      q.operands[0] % 10 === 9 &&
      q.operands[0] >= 19 && q.operands[0] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 1, 9) * 10 + 9
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-ending-9')
    },
  },
  {
    slug: 'squares-repdigit',
    name: 'Square a repdigit (11, 22, … 99)',
    category: 'squaring',
    lesson:
      'Numbers like 11, 22, 33 … are multiples of 11: a = 11k.\n' +
      'So a² = (11k)² = 121 · k² — square the repeated digit, then ' +
      'multiply by 121.\n\n' +
      'Example: 33² → k = 3, k² = 9 → 9 × 121 = 1089.',
    tip: 'Repdigit (11k)²: square the digit k, then multiply by 121.',
    applies: (q) => {
      if (q.operation !== 'square') return false
      const a = q.operands[0]
      if (a < 11 || a > 99) return false
      return Math.floor(a / 10) === a % 10 && a % 10 !== 0
    },
    generate: (rng) => {
      const k = pick(rng, [1, 2, 3, 4, 6, 7, 8, 9])
      const a = k * 11
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-repdigit')
    },
  },
  {
    slug: 'squares-near-50',
    name: 'Square a number near 50',
    category: 'squaring',
    lesson:
      'Write the number as 50 + d (d can be negative).\n' +
      'Then (50 + d)² = 2500 + 100d + d², so:\n' +
      '  first two digits = 25 + d\n' +
      '  last two digits  = d² (padded to two digits)\n\n' +
      'Example: 53² → d = 3 → 28 | 09 → 2809.',
    tip: '(50+d)²: write (25+d) then d² side by side.',
    applies: (q) => {
      if (q.operation !== 'square') return false
      const d = q.operands[0] - 50
      return Math.abs(d) >= 1 && Math.abs(d) <= 9
    },
    generate: (rng) => {
      const d = pick(rng, [-9, -8, -7, -6, -4, -3, -2, -1, 1, 2, 3, 4, 6, 7, 8, 9])
      const a = 50 + d
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-near-50')
    },
  },
  {
    slug: 'squares-near-100',
    name: 'Square a number near 100',
    category: 'squaring',
    lesson:
      'Write the number as 100 + d (d can be negative).\n' +
      'Then (100 + d)² = 10000 + 200d + d², so:\n' +
      '  left part  = number + d\n' +
      '  right part = d² (padded to two digits)\n\n' +
      'Example: 96² → d = −4 → 92 | 16 → 9216.',
    tip: 'Near 100: left = number + d, right = d², concatenate.',
    applies: (q) => {
      if (q.operation !== 'square') return false
      const d = q.operands[0] - 100
      return Math.abs(d) >= 1 && Math.abs(d) <= 9
    },
    generate: (rng) => {
      const d = pick(rng, [-9, -8, -7, -6, -4, -3, -2, -1, 1, 2, 3, 4, 6, 7, 8, 9])
      const a = 100 + d
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-near-100')
    },
  },
  {
    slug: 'squares-near-round-base',
    name: 'Square near a round base (30–80)',
    category: 'squaring',
    lesson:
      'Pick the nearest round base B (30, 40, 60, 70 or 80). Let d = a − B.\n' +
      'Then a² = B² + 2·B·d + d² — three easy pieces.\n\n' +
      'Example: 43² → B = 40, d = 3 → 1600 + 240 + 9 = 1849.',
    tip: 'Near a round base B: B² + 2Bd + d² where d = a − B.',
    applies: (q) => {
      if (q.operation !== 'square') return false
      const a = q.operands[0]
      for (const B of [30, 40, 60, 70, 80]) {
        const d = a - B
        if (Math.abs(d) >= 1 && Math.abs(d) <= 4) return true
      }
      return false
    },
    generate: (rng) => {
      const B = pick(rng, [30, 40, 60, 70, 80])
      const d = pick(rng, [-4, -3, -2, -1, 1, 2, 3, 4])
      const a = B + d
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-near-round-base')
    },
  },
  {
    slug: 'squares-anchor-ten',
    name: 'Square via nearest-ten anchor',
    category: 'squaring',
    lesson:
      'Round to the nearest multiple of 10. Call the gap d.\n' +
      'Use a² = (a − d)(a + d) + d². One factor becomes a multiple of 10, ' +
      'so the product is easy.\n\n' +
      'Example: 77² → 80 is nearest, d = 3 → 74 × 80 + 9 = 5929.',
    tip: 'Round to nearest 10 (gap d): (a−d)(a+d) + d².',
    applies: (q) => {
      if (q.operation !== 'square') return false
      const a = q.operands[0]
      if (a < 11 || a > 99) return false
      const rem = a % 10
      return rem !== 0 && rem !== 5
    },
    generate: (rng) => {
      const a = randInt(rng, 1, 9) * 10 + pick(rng, [1, 2, 3, 4, 6, 7, 8, 9])
      return makeQuestion('square', [a], `${a}²`, a * a, 'squares-anchor-ten')
    },
  },

  // ─── Division ──────────────────────────────────────────────────────────
  {
    slug: 'divide-by-4',
    name: 'Divide by 4 (halve twice)',
    category: 'division',
    lesson:
      'To divide by 4, halve the number twice (4 = 2 × 2).\n\n' +
      'Example: 348 ÷ 4 → 348 ÷ 2 = 174 → 174 ÷ 2 = 87.',
    tip: '÷4: halve the number, then halve again.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 4,
    generate: (rng) => {
      const quotient = randInt(rng, 10, 249)
      const dividend = quotient * 4
      return makeQuestion(
        'divide', [dividend, 4], `${dividend} ÷ 4`, quotient, 'divide-by-4',
      )
    },
  },
  {
    slug: 'divide-by-5',
    name: 'Divide by 5',
    category: 'division',
    lesson:
      'To divide by 5, double the number then divide by 10 (1/5 = 2/10).\n\n' +
      'Example: 345 ÷ 5 → 345 × 2 = 690 → 690 ÷ 10 = 69.',
    tip: '÷5: double the number, then drop the last digit.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 5,
    generate: (rng) => {
      const quotient = randInt(rng, 10, 199)
      const dividend = quotient * 5
      return makeQuestion(
        'divide', [dividend, 5], `${dividend} ÷ 5`, quotient, 'divide-by-5',
      )
    },
  },
  {
    slug: 'divide-by-8',
    name: 'Divide by 8 (halve three times)',
    category: 'division',
    lesson:
      'To divide by 8, halve the number three times (8 = 2³).\n\n' +
      'Example: 424 ÷ 8 → 212 → 106 → 53.',
    tip: '÷8: halve three times — ÷2, ÷2, ÷2.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 8,
    generate: (rng) => {
      const quotient = randInt(rng, 10, 124)
      const dividend = quotient * 8
      return makeQuestion(
        'divide', [dividend, 8], `${dividend} ÷ 8`, quotient, 'divide-by-8',
      )
    },
  },
  {
    slug: 'divide-by-9',
    name: 'Divide by 9',
    category: 'division',
    lesson:
      'A number is divisible by 9 exactly when its digit sum is divisible ' +
      'by 9 — use that to check your work.\n\n' +
      'Example: 567 ÷ 9 → digit sum 5 + 6 + 7 = 18 (a multiple of 9) → 63.',
    tip: '÷9: the digit sum of a multiple of 9 is itself a multiple of 9.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 9,
    generate: (rng) => {
      const quotient = randInt(rng, 11, 99)
      const dividend = quotient * 9
      return makeQuestion(
        'divide', [dividend, 9], `${dividend} ÷ 9`, quotient, 'divide-by-9',
      )
    },
  },
  {
    slug: 'divide-by-20',
    name: 'Divide by 20',
    category: 'division',
    lesson:
      'To divide by 20, divide by 10 (drop a zero) then halve ' +
      '(20 = 10 × 2).\n\n' +
      'Example: 460 ÷ 20 → 460 ÷ 10 = 46 → 46 ÷ 2 = 23.',
    tip: '÷20: divide by 10, then halve.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 20,
    generate: (rng) => {
      const quotient = randInt(rng, 10, 99)
      const dividend = quotient * 20
      return makeQuestion(
        'divide', [dividend, 20], `${dividend} ÷ 20`, quotient, 'divide-by-20',
      )
    },
  },
  {
    slug: 'divide-by-25',
    name: 'Divide by 25',
    category: 'division',
    lesson:
      'To divide by 25, multiply the number by 4 then divide by 100 ' +
      '(1/25 = 4/100).\n\n' +
      'Example: 1625 ÷ 25 → 1625 × 4 = 6500 → 6500 ÷ 100 = 65.',
    tip: '÷25: multiply by 4, then chop the last two digits.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 25,
    generate: (rng) => {
      const quotient = randInt(rng, 4, 99)
      const dividend = quotient * 25
      return makeQuestion(
        'divide', [dividend, 25], `${dividend} ÷ 25`, quotient, 'divide-by-25',
      )
    },
  },
  {
    slug: 'divide-by-50',
    name: 'Divide by 50',
    category: 'division',
    lesson:
      'To divide by 50, double the number then divide by 100 ' +
      '(1/50 = 2/100).\n\n' +
      'Example: 1350 ÷ 50 → 1350 × 2 = 2700 → 2700 ÷ 100 = 27.',
    tip: '÷50: double the number, then divide by 100.',
    applies: (q) => q.operation === 'divide' && q.operands[1] === 50,
    generate: (rng) => {
      const quotient = randInt(rng, 5, 99)
      const dividend = quotient * 50
      return makeQuestion(
        'divide', [dividend, 50], `${dividend} ÷ 50`, quotient, 'divide-by-50',
      )
    },
  },

  // ─── Addition & Subtraction ────────────────────────────────────────────
  {
    slug: 'add-nine',
    name: 'Adding 9',
    category: 'addition-subtraction',
    lesson:
      'To add 9, add 10 then subtract 1.\n\n' +
      'Example: 47 + 9 → 47 + 10 − 1 = 57 − 1 = 56.',
    tip: '+9: add 10, then subtract 1.',
    applies: (q) =>
      q.operation === 'add' &&
      q.operands.length === 2 &&
      (q.operands[0] === 9 || q.operands[1] === 9),
    generate: (rng) => {
      const other = randInt(rng, 11, 90)
      const [a, b] = rng() < 0.5 ? [9, other] : [other, 9]
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-nine')
    },
  },
  {
    slug: 'add-ninety-nine',
    name: 'Adding 99',
    category: 'addition-subtraction',
    lesson:
      'To add 99, add 100 then subtract 1.\n\n' +
      'Example: 148 + 99 → 148 + 100 − 1 = 248 − 1 = 247.',
    tip: '+99: add 100, then subtract 1.',
    applies: (q) =>
      q.operation === 'add' &&
      q.operands.length === 2 &&
      (q.operands[0] === 99 || q.operands[1] === 99),
    generate: (rng) => {
      const other = randInt(rng, 10, 200)
      const [a, b] = rng() < 0.5 ? [99, other] : [other, 99]
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-ninety-nine')
    },
  },
  {
    slug: 'sub-nine',
    name: 'Subtracting 9',
    category: 'addition-subtraction',
    lesson:
      'To subtract 9, subtract 10 then add 1 back.\n\n' +
      'Example: 63 − 9 → 63 − 10 + 1 = 53 + 1 = 54.',
    tip: '−9: subtract 10, then add 1.',
    applies: (q) =>
      q.operation === 'subtract' &&
      q.operands.length === 2 &&
      q.operands[1] === 9,
    generate: (rng) => {
      const a = randInt(rng, 19, 99)
      return makeQuestion('subtract', [a, 9], `${a} − 9`, a - 9, 'sub-nine')
    },
  },
  {
    slug: 'add-make-ten',
    name: 'Make-a-ten addition',
    category: 'addition-subtraction',
    lesson:
      'When the units digits of the two numbers sum to exactly 10, the ' +
      'answer ends in 0 — just add the tens parts and the carried 10.\n\n' +
      'Example: 37 + 43 → units 7 + 3 = 10 → 30 + 40 + 10 = 80.',
    tip: 'Units add to 10? Add the tens and tack on a fresh ten.',
    applies: (q) =>
      q.operation === 'add' &&
      q.operands.length === 2 &&
      q.operands[0] % 10 !== 0 &&
      q.operands[1] % 10 !== 0 &&
      (q.operands[0] % 10) + (q.operands[1] % 10) === 10,
    generate: (rng) => {
      const u = randInt(rng, 1, 9)
      const v = 10 - u
      const a = randInt(rng, 1, 8) * 10 + u
      const b = randInt(rng, 1, 8) * 10 + v
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-make-ten')
    },
  },
  {
    slug: 'add-near-doubles',
    name: 'Near-doubles addition',
    category: 'addition-subtraction',
    lesson:
      'When two numbers are close (differ by 1, 2 or 3), double the smaller ' +
      'one and add the gap.\n\n' +
      'Example: 36 + 38 → 2 × 36 + 2 = 72 + 2 = 74.',
    tip: 'Close numbers? Double the smaller, then add the gap.',
    applies: (q) => {
      if (q.operation !== 'add' || q.operands.length !== 2) return false
      const [a, b] = q.operands
      const diff = Math.abs(a - b)
      return diff >= 1 && diff <= 3 && a >= 10 && b >= 10
    },
    generate: (rng) => {
      const smaller = randInt(rng, 11, 95)
      const gap = randInt(rng, 1, 3)
      const [a, b] = rng() < 0.5
        ? [smaller, smaller + gap]
        : [smaller + gap, smaller]
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-near-doubles')
    },
  },
  {
    slug: 'add-round-compensate',
    name: 'Round-and-compensate addition',
    category: 'addition-subtraction',
    lesson:
      'When one number ends in 8 or 9, round it up to the next ten, add, ' +
      'then subtract the small amount you added.\n\n' +
      'Example: 47 + 39 → 47 + 40 − 1 = 87 − 1 = 86.',
    tip: 'Ends in 8 or 9? Round up, add, then subtract the gap.',
    applies: (q) =>
      q.operation === 'add' &&
      q.operands.length === 2 &&
      (q.operands[0] % 10 === 8 || q.operands[0] % 10 === 9 ||
        q.operands[1] % 10 === 8 || q.operands[1] % 10 === 9),
    generate: (rng) => {
      const base = randInt(rng, 1, 9) * 10 + pick(rng, [8, 9])
      const other = randInt(rng, 11, 89)
      const [a, b] = rng() < 0.5 ? [base, other] : [other, base]
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-round-compensate')
    },
  },
  {
    slug: 'sub-from-round-hundred',
    name: 'Subtract from a round hundred',
    category: 'addition-subtraction',
    lesson:
      'To subtract from a round hundred, use the rule "all from 9 and the ' +
      'last from 10": each digit from 9, the final digit from 10.\n\n' +
      'Example: 100 − 37 → (9−3)(10−7) = 63.\n' +
      'Example: 200 − 54 → 100 − 54 = 46 → 146.',
    tip: 'Round hundred minus: last digit from 10, the rest from 9.',
    applies: (q) =>
      q.operation === 'subtract' &&
      q.operands.length === 2 &&
      q.operands[0] % 100 === 0 &&
      q.operands[0] >= 100 &&
      q.operands[1] > 0 &&
      q.operands[1] < q.operands[0],
    generate: (rng) => {
      const hundreds = randInt(rng, 1, 9) * 100
      const b = randInt(rng, 1, hundreds - 1)
      return makeQuestion(
        'subtract', [hundreds, b], `${hundreds} − ${b}`,
        hundreds - b, 'sub-from-round-hundred',
      )
    },
  },
  {
    slug: 'sub-round-compensate',
    name: 'Subtract by rounding up',
    category: 'addition-subtraction',
    lesson:
      'When the number being subtracted ends in 8 or 9, round it up to the ' +
      'next ten, subtract, then add back the difference.\n\n' +
      'Example: 83 − 29 → 83 − 30 + 1 = 53 + 1 = 54.',
    tip: 'Subtracting a number ending in 8/9? Round it up, then add the gap back.',
    applies: (q) =>
      q.operation === 'subtract' &&
      q.operands.length === 2 &&
      (q.operands[1] % 10 === 8 || q.operands[1] % 10 === 9),
    generate: (rng) => {
      const b = randInt(rng, 1, 7) * 10 + pick(rng, [8, 9])
      const a = b + randInt(rng, 1, 50)
      return makeQuestion(
        'subtract', [a, b], `${a} − ${b}`, a - b, 'sub-round-compensate',
      )
    },
  },

  // ─── Percentages ───────────────────────────────────────────────────────
  {
    slug: 'one-percent',
    name: '1% — move the decimal twice',
    category: 'percentages',
    lesson:
      'To find 1% of a number, move the decimal point two places left ' +
      '(divide by 100).\n\n' +
      'Example: 1% of 800 → 8.00 → 8.',
    tip: '1%: shift the decimal two places left.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 1,
    generate: (rng) => {
      const base = randInt(rng, 1, 20) * 100
      return makeQuestion(
        'percent', [1, base], `1% of ${base}`, base / 100, 'one-percent',
      )
    },
  },
  {
    slug: 'five-percent',
    name: '5% — half of 10%',
    category: 'percentages',
    lesson:
      'To find 5%, take 10% (move the decimal one place left) and halve it.' +
      '\n\nExample: 5% of 240 → 10% is 24 → half of 24 = 12.',
    tip: '5%: take 10%, then halve it.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 5,
    generate: (rng) => {
      const base = randInt(rng, 1, 25) * 20
      return makeQuestion(
        'percent', [5, base], `5% of ${base}`, base / 20, 'five-percent',
      )
    },
  },
  {
    slug: 'ten-percent',
    name: '10% — move the decimal',
    category: 'percentages',
    lesson:
      'To find 10% of a number, move the decimal point one place left ' +
      '(divide by 10).\n\n' +
      'Example: 10% of 340 → 34.0 → 34.',
    tip: '10%: shift the decimal one place left.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 10,
    generate: (rng) => {
      const base = randInt(rng, 1, 30) * 10
      return makeQuestion(
        'percent', [10, base], `10% of ${base}`, base / 10, 'ten-percent',
      )
    },
  },
  {
    slug: 'fifteen-percent',
    name: '15% — 10% plus half again',
    category: 'percentages',
    lesson:
      'To find 15%, take 10%, then add half of that (which is 5%).\n\n' +
      'Example: 15% of 160 → 10% is 16, 5% is 8 → 16 + 8 = 24.',
    tip: '15%: add 10% and 5% (5% is half of 10%).',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 15,
    generate: (rng) => {
      const base = randInt(rng, 1, 20) * 20
      return makeQuestion(
        'percent', [15, base], `15% of ${base}`, (base * 3) / 20, 'fifteen-percent',
      )
    },
  },
  {
    slug: 'twenty-percent',
    name: '20% — double the 10%',
    category: 'percentages',
    lesson:
      'To find 20%, take 10% (move the decimal one place left) and double ' +
      'it.\n\nExample: 20% of 350 → 10% is 35 → 35 × 2 = 70.',
    tip: '20%: take 10%, then double it.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 20,
    generate: (rng) => {
      const base = randInt(rng, 1, 30) * 10
      return makeQuestion(
        'percent', [20, base], `20% of ${base}`, base / 5, 'twenty-percent',
      )
    },
  },
  {
    slug: 'twenty-five-percent',
    name: '25% — divide by 4',
    category: 'percentages',
    lesson:
      'To find 25% of a number, divide it by 4 (25% = 1/4).\n\n' +
      'Example: 25% of 120 → 120 ÷ 4 = 30.',
    tip: '25%: divide the number by 4.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 25,
    generate: (rng) => {
      const base = randInt(rng, 1, 50) * 4
      return makeQuestion(
        'percent', [25, base], `25% of ${base}`, base / 4, 'twenty-five-percent',
      )
    },
  },
  {
    slug: 'fifty-percent',
    name: '50% — take half',
    category: 'percentages',
    lesson:
      'To find 50% of a number, divide it by 2 (50% = 1/2).\n\n' +
      'Example: 50% of 380 → 380 ÷ 2 = 190.',
    tip: '50%: just halve the number.',
    applies: (q) => q.operation === 'percent' && q.operands[0] === 50,
    generate: (rng) => {
      const base = randInt(rng, 1, 100) * 2
      return makeQuestion(
        'percent', [50, base], `50% of ${base}`, base / 2, 'fifty-percent',
      )
    },
  },
  {
    slug: 'percent-swap',
    name: 'Swap the percentage',
    category: 'percentages',
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
