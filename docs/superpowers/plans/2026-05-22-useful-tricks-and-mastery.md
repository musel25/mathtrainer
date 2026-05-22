# Useful Tricks + Per-Trick Mastery Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 new mental-math tricks (5 universal methods + ×3/×6/×7) and rebuild the Tricks page into a per-trick mastery dashboard.

**Architecture:** Entirely frontend. Tricks live in `frontend/src/lib/tricks.ts`; the backend treats trick slugs opaquely, so `/api/tricks` and the DB need no changes. A new `autoDetect` flag on the `Trick` interface keeps "general method" tricks out of the auto-detection chain (avoids difficulty deflation). A new pure helper module computes mastery levels for the dashboard.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Tailwind CSS v4.

**Working directory:** the worktree at `.claude/worktrees/feat+useful-tricks-and-mastery` (branch `worktree-feat+useful-tricks-and-mastery`, off `main`). All `npm`/`npx` commands run from the `frontend/` subdirectory; all `git` commands run from the worktree root.

**Design spec:** `docs/superpowers/specs/2026-05-22-useful-tricks-and-mastery-design.md`

---

## File Structure

- `frontend/src/lib/tricks.ts` — MODIFY: add `autoDetect` to the `Trick` interface, filter it in `detectTrick`, add 8 trick objects.
- `frontend/src/lib/tricks.test.ts` — MODIFY: tests for the new tricks and the `detectTrick` filter.
- `frontend/src/lib/trickMastery.ts` — CREATE: pure mastery-level helpers.
- `frontend/src/lib/trickMastery.test.ts` — CREATE: tests for the helpers.
- `frontend/src/components/ui/ProgressBar.tsx` — MODIFY: add an optional `fillClassName` prop.
- `frontend/src/components/TricksPage.tsx` — MODIFY: rebuild as a mastery dashboard.

Detection-order note: `detectTrick` scans `TRICKS` in array order. The `×3/×6/×7` shortcuts are operand-specific so their position is harmless. The general methods are `autoDetect: false`, so they are skipped by `detectTrick` regardless of position — they are placed **first within their operation category** purely for catalog display order.

---

## Task 1: Multiplication shortcuts ×3, ×6, ×7

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `frontend/src/lib/tricks.test.ts` (after the existing `describe('trick library', …)` block):

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['times-3']` is `undefined`, so `.toBeTruthy()` fails.

- [ ] **Step 3: Add the three trick objects**

In `frontend/src/lib/tricks.ts`, insert the following three objects into the `TRICKS` array immediately **after** the `times-9` trick object and **before** the `times-12` trick object:

```ts
  {
    slug: 'times-3',
    name: 'Multiply by 3',
    category: 'multiplication',
    lesson:
      'Multiplying by 3 is doubling the number, then adding the number ' +
      'once more.\n\nExample: 26 × 3 → double 26 = 52, then 52 + 26 = 78.',
    tip: '×3: double the number, then add it once more.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(3),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 3], `${a} × 3`, a * 3, 'times-3')
    },
  },
  {
    slug: 'times-6',
    name: 'Multiply by 6',
    category: 'multiplication',
    lesson:
      'Multiplying by 6 is multiplying by 3, then doubling (6 = 3 × 2).\n\n' +
      'Example: 14 × 6 → 14 × 3 = 42, then double 42 = 84.',
    tip: '×6: multiply by 3, then double.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(6),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 6], `${a} × 6`, a * 6, 'times-6')
    },
  },
  {
    slug: 'times-7',
    name: 'Multiply by 7',
    category: 'multiplication',
    lesson:
      'Multiplying by 7 is multiplying by 5, then adding double the number ' +
      '(7 = 5 + 2).\n\n' +
      'Example: 18 × 7 → 18 × 5 = 90, double 18 = 36, then 90 + 36 = 126.',
    tip: '×7: multiply by 5, then add double the number.',
    applies: (q) => q.operation === 'multiply' && q.operands.includes(7),
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      return makeQuestion('multiply', [a, 7], `${a} × 7`, a * 7, 'times-7')
    },
  },
```

- [ ] **Step 4: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests, including the existing `"each trick's generate() produces a question it applies to"` loop (which now also covers the three new tricks).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add ×3, ×6, ×7 multiplication shortcuts"
```

---

## Task 2: `autoDetect` flag + `detectTrick` filter + 2-digit × 2-digit method

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

This task introduces the "general method" concept. `mult-2digit-crisscross` is the first `autoDetect: false` trick, which makes the `detectTrick` filter testable.

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `frontend/src/lib/tricks.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['mult-2digit-crisscross']` is `undefined`.

- [ ] **Step 3: Add the `autoDetect` field to the `Trick` interface**

In `frontend/src/lib/tricks.ts`, change the `Trick` interface. Replace:

```ts
export interface Trick {
  slug: string
  name: string
  category: TrickCategory
  lesson: string
  tip: string
  applies: (q: Pick<Question, 'operation' | 'operands'>) => boolean
  generate: (rng: () => number) => Question
}
```

with:

```ts
export interface Trick {
  slug: string
  name: string
  category: TrickCategory
  lesson: string
  tip: string
  /**
   * When false, this is a "general method" — it applies to almost any
   * question of its type, so `detectTrick` skips it (to avoid blanket
   * difficulty relief and false labeling). It still appears in the
   * catalog and Learn mode. Defaults to true (a pattern shortcut).
   */
  autoDetect?: boolean
  applies: (q: Pick<Question, 'operation' | 'operands'>) => boolean
  generate: (rng: () => number) => Question
}
```

- [ ] **Step 4: Update `detectTrick` to honor `autoDetect`**

In `frontend/src/lib/tricks.ts`, replace the `detectTrick` function body. Replace:

```ts
export function detectTrick(
  q: Pick<Question, 'operation' | 'operands'>,
): string | null {
  for (const t of TRICKS) {
    if (t.applies(q)) return t.slug
  }
  return null
}
```

with:

```ts
export function detectTrick(
  q: Pick<Question, 'operation' | 'operands'>,
): string | null {
  for (const t of TRICKS) {
    if (t.autoDetect !== false && t.applies(q)) return t.slug
  }
  return null
}
```

- [ ] **Step 5: Add the `mult-2digit-crisscross` trick**

In `frontend/src/lib/tricks.ts`, insert this object into the `TRICKS` array as the **first element**, immediately after the `// ─── Multiplication ───` comment banner and before the `times-11` trick:

```ts
  {
    slug: 'mult-2digit-crisscross',
    name: 'Two-digit × two-digit (criss-cross)',
    category: 'multiplication',
    autoDetect: false,
    lesson:
      'To multiply two 2-digit numbers, split each into tens and units and ' +
      'build three pieces:\n' +
      '  • units × units\n' +
      '  • the cross sum: (tens of one × units of the other), both ways, ' +
      'added together\n' +
      '  • tens × tens\n\n' +
      'Place units×units in the ones column, the cross sum in the tens ' +
      'column, and tens×tens in the hundreds column — carrying as needed.\n\n' +
      'Example: 23 × 41 → units 3×1 = 3 → cross 2×1 + 3×4 = 14 → ' +
      'tens 2×4 = 8.\n' +
      '3 in the ones, 14 in the tens (carry 1), 8 + 1 = 9 in the hundreds ' +
      '→ 943.',
    tip: '2-digit × 2-digit: units×units, cross sum, tens×tens — carry as you go.',
    applies: (q) =>
      q.operation === 'multiply' &&
      q.operands.length === 2 &&
      q.operands[0] >= 10 && q.operands[0] <= 99 &&
      q.operands[1] >= 10 && q.operands[1] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      const b = randInt(rng, 11, 99)
      return makeQuestion(
        'multiply', [a, b], `${a} × ${b}`, a * b, 'mult-2digit-crisscross',
      )
    },
  },
```

- [ ] **Step 6: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add autoDetect flag and 2-digit × 2-digit criss-cross method"
```

---

## Task 3: 2-digit × 1-digit place-value method

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/tricks.test.ts`:

```ts
describe('mult-1digit-placevalue', () => {
  it('is a registered general method', () => {
    const t = TRICK_BY_SLUG['mult-1digit-placevalue']
    expect(t).toBeTruthy()
    expect(t.autoDetect).toBe(false)
  })

  it('generates a 2-digit × 1-digit question with the correct answer', () => {
    const t = TRICK_BY_SLUG['mult-1digit-placevalue']
    for (let i = 0; i < 50; i++) {
      const q = t.generate(Math.random)
      const [a, b] = q.operands
      expect(q.answer).toBe(a * b)
      expect(t.applies(q)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['mult-1digit-placevalue']` is `undefined`.

- [ ] **Step 3: Add the `mult-1digit-placevalue` trick**

In `frontend/src/lib/tricks.ts`, insert this object into the `TRICKS` array immediately after the `// ─── Multiplication ───` comment banner and **before** the `mult-2digit-crisscross` trick (so it is the first multiplication trick):

```ts
  {
    slug: 'mult-1digit-placevalue',
    name: 'Two-digit × one-digit (place value)',
    category: 'multiplication',
    autoDetect: false,
    lesson:
      'To multiply a 2-digit number by a single digit, split the 2-digit ' +
      'number into its tens and units, multiply each part separately, then ' +
      'add the two results.\n\n' +
      'Example: 47 × 6 → 40 × 6 = 240, 7 × 6 = 42, then 240 + 42 = 282.',
    tip: '2-digit × 1-digit: multiply the tens and the units separately, then add.',
    applies: (q) => {
      if (q.operation !== 'multiply' || q.operands.length !== 2) return false
      const [a, b] = q.operands
      const twoDigit = (n: number) => n >= 10 && n <= 99
      const oneDigit = (n: number) => n >= 2 && n <= 9
      return (twoDigit(a) && oneDigit(b)) || (oneDigit(a) && twoDigit(b))
    },
    generate: (rng) => {
      const a = randInt(rng, 12, 99)
      const b = randInt(rng, 3, 9)
      return makeQuestion(
        'multiply', [a, b], `${a} × ${b}`, a * b, 'mult-1digit-placevalue',
      )
    },
  },
```

- [ ] **Step 4: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add 2-digit × 1-digit place-value method"
```

---

## Task 4: Left-to-right addition method

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/tricks.test.ts`:

```ts
describe('add-left-to-right', () => {
  it('is a registered general method', () => {
    const t = TRICK_BY_SLUG['add-left-to-right']
    expect(t).toBeTruthy()
    expect(t.autoDetect).toBe(false)
  })

  it('generates a 2-digit + 2-digit question with the correct answer', () => {
    const t = TRICK_BY_SLUG['add-left-to-right']
    for (let i = 0; i < 50; i++) {
      const q = t.generate(Math.random)
      const [a, b] = q.operands
      expect(q.answer).toBe(a + b)
      expect(t.applies(q)).toBe(true)
    }
  })

  it('is skipped by detectTrick', () => {
    // 53 + 24 matches no auto-detected addition trick.
    expect(detectTrick({ operation: 'add', operands: [53, 24] })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['add-left-to-right']` is `undefined`.

- [ ] **Step 3: Add the `add-left-to-right` trick**

In `frontend/src/lib/tricks.ts`, insert this object into the `TRICKS` array immediately after the `// ─── Addition & Subtraction ───` comment banner and before the `add-nine` trick:

```ts
  {
    slug: 'add-left-to-right',
    name: 'Left-to-right addition',
    category: 'addition-subtraction',
    autoDetect: false,
    lesson:
      'Add from the left, not the right: add the tens first, then the ' +
      'units, then combine the two results.\n\n' +
      'Example: 58 + 37 → tens 50 + 30 = 80, units 8 + 7 = 15, ' +
      'then 80 + 15 = 95.',
    tip: 'Add the tens, add the units, then combine the two results.',
    applies: (q) =>
      q.operation === 'add' &&
      q.operands.length === 2 &&
      q.operands[0] >= 10 && q.operands[0] <= 99 &&
      q.operands[1] >= 10 && q.operands[1] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 11, 99)
      const b = randInt(rng, 11, 99)
      return makeQuestion('add', [a, b], `${a} + ${b}`, a + b, 'add-left-to-right')
    },
  },
```

- [ ] **Step 4: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add left-to-right addition method"
```

---

## Task 5: Count-up subtraction method

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/tricks.test.ts`:

```ts
describe('sub-count-up', () => {
  it('is a registered general method', () => {
    const t = TRICK_BY_SLUG['sub-count-up']
    expect(t).toBeTruthy()
    expect(t.autoDetect).toBe(false)
  })

  it('generates a subtraction question with a positive correct answer', () => {
    const t = TRICK_BY_SLUG['sub-count-up']
    for (let i = 0; i < 50; i++) {
      const q = t.generate(Math.random)
      const [a, b] = q.operands
      expect(q.answer).toBe(a - b)
      expect(q.answer).toBeGreaterThan(0)
      expect(t.applies(q)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['sub-count-up']` is `undefined`.

- [ ] **Step 3: Add the `sub-count-up` trick**

In `frontend/src/lib/tricks.ts`, insert this object into the `TRICKS` array immediately after the `add-left-to-right` trick (added in Task 4):

```ts
  {
    slug: 'sub-count-up',
    name: 'Count-up subtraction',
    category: 'addition-subtraction',
    autoDetect: false,
    lesson:
      'Instead of taking away, count up from the smaller number to the ' +
      'larger one — the total distance you travel is the answer. Step up to ' +
      'the next round ten first, then the rest.\n\n' +
      'Example: 84 − 67 → from 67 up to 70 is 3, from 70 up to 84 is 14, ' +
      'so 3 + 14 = 17.',
    tip: 'Subtraction: count up from the smaller number to the larger one.',
    applies: (q) =>
      q.operation === 'subtract' &&
      q.operands.length === 2 &&
      q.operands[0] > q.operands[1] &&
      q.operands[1] >= 10 && q.operands[0] <= 99,
    generate: (rng) => {
      const a = randInt(rng, 30, 99)
      const b = randInt(rng, 11, a - 1)
      return makeQuestion('subtract', [a, b], `${a} − ${b}`, a - b, 'sub-count-up')
    },
  },
```

- [ ] **Step 4: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add count-up subtraction method"
```

---

## Task 6: Building-block percentages method

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Test: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/tricks.test.ts`:

```ts
describe('percent-building-blocks', () => {
  it('is a registered general method', () => {
    const t = TRICK_BY_SLUG['percent-building-blocks']
    expect(t).toBeTruthy()
    expect(t.autoDetect).toBe(false)
  })

  it('generates a percent question with an integer correct answer', () => {
    const t = TRICK_BY_SLUG['percent-building-blocks']
    for (let i = 0; i < 50; i++) {
      const q = t.generate(Math.random)
      const [pct, base] = q.operands
      expect(q.answer).toBe((pct * base) / 100)
      expect(Number.isInteger(q.answer)).toBe(true)
      expect(t.applies(q)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `TRICK_BY_SLUG['percent-building-blocks']` is `undefined`.

- [ ] **Step 3: Add the `percent-building-blocks` trick**

In `frontend/src/lib/tricks.ts`, insert this object into the `TRICKS` array immediately after the `// ─── Percentages ───` comment banner and before the `one-percent` trick:

```ts
  {
    slug: 'percent-building-blocks',
    name: 'Any percentage from building blocks',
    category: 'percentages',
    autoDetect: false,
    lesson:
      'Any percentage can be built from easy chunks: 10% (move the decimal ' +
      'one place left), 5% (half of 10%), and 1% (move the decimal two ' +
      'places left). Add the chunks you need.\n\n' +
      'Example: 37% of 200 → 10% = 20, so 30% = 60; 5% = 10; 1% = 2, so ' +
      '2% = 4. Total: 60 + 10 + 4 = 74.',
    tip: 'Any %: build it from 10%, 5% and 1% chunks, then add them up.',
    applies: (q) => q.operation === 'percent',
    generate: (rng) => {
      const pct = pick(rng, [12, 15, 35, 37, 45, 55, 65, 85])
      const base = randInt(rng, 1, 20) * 100
      // multiply before dividing: pct*base is a multiple of 100, so the
      // result is an exact integer (avoids float error like 0.35*700).
      return makeQuestion(
        'percent', [pct, base], `${pct}% of ${base}`,
        (pct * base) / 100, 'percent-building-blocks',
      )
    },
  },
```

- [ ] **Step 4: Run the full frontend test suite to verify it passes**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add building-block percentages method"
```

---

## Task 7: Trick mastery helper module

**Files:**
- Create: `frontend/src/lib/trickMastery.ts`
- Test: `frontend/src/lib/trickMastery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/trickMastery.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/trickMastery.test.ts`
Expected: FAIL — `trickMastery.ts` does not exist (import error).

- [ ] **Step 3: Create the helper module**

Create `frontend/src/lib/trickMastery.ts` with:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/trickMastery.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/trickMastery.ts frontend/src/lib/trickMastery.test.ts
git commit -m "feat: add trick mastery helper module"
```

---

## Task 8: Rebuild the Tricks page as a mastery dashboard

**Files:**
- Modify: `frontend/src/components/ui/ProgressBar.tsx`
- Modify: `frontend/src/components/TricksPage.tsx`

This task has no unit test — the project has no React component tests, and the pure logic it relies on is fully covered by Task 7. It is verified by typecheck + build + the full existing test suite.

- [ ] **Step 1: Add an optional `fillClassName` prop to `ProgressBar`**

Replace the entire contents of `frontend/src/components/ui/ProgressBar.tsx` with:

```tsx
interface Props {
  value: number
  max: number
  className?: string
  fillClassName?: string
}

export function ProgressBar({
  value, max, className = '', fillClassName = 'bg-accent',
}: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full ${fillClassName} transition-[width] duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
```

This is backward compatible: existing callers pass no `fillClassName` and keep the `bg-accent` fill.

- [ ] **Step 2: Rebuild `TricksPage`**

Replace the entire contents of `frontend/src/components/TricksPage.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import {
  TRICKS, CATEGORY_META, TRICK_BY_SLUG, type Trick,
} from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'
import {
  masteryLevel, needsWork, categorySummary, type MasteryLevel,
} from '../lib/trickMastery'
import { Screen } from './ui/Screen'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'

interface Props {
  onBack: () => void
  onLearn: (trick: Trick) => void
}

/** Mastery level → ProgressBar fill colour. */
const FILL: Record<MasteryLevel, string> = {
  unpracticed: 'bg-dim',
  weak: 'bg-error',
  ok: 'bg-streak',
  strong: 'bg-success',
}

export function TricksPage({ onBack, onLearn }: Props) {
  const [stats, setStats] = useState<Record<string, TrickStat>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTricks()
      .then((rows) => {
        const map: Record<string, TrickStat> = {}
        for (const r of rows) map[r.slug] = r
        setStats(map)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  function renderTrick(trick: Trick) {
    const stat = stats[trick.slug]
    const level = masteryLevel(stat)
    const pct = stat && stat.attempts > 0
      ? Math.round(stat.proficiency * 100)
      : null
    return (
      <Card key={trick.slug} className="mb-3.5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="text-base text-text">
            {trick.name}
            {trick.autoDetect === false && (
              <span className="ml-2 rounded border border-accent/50 px-1.5
                py-0.5 align-middle font-mono text-[10px] text-accent">
                core method
              </span>
            )}
          </strong>
          <span className="font-mono text-xs text-muted">
            {pct === null
              ? 'not practised'
              : `${pct}% (${stat.correct}/${stat.attempts})`}
          </span>
        </div>
        <ProgressBar
          value={pct ?? 0}
          max={100}
          className="my-2.5"
          fillClassName={FILL[level]}
        />
        <p className="my-3 whitespace-pre-line text-sm text-muted">
          {trick.lesson}
        </p>
        <Button onClick={() => onLearn(trick)}>Practise this trick</Button>
      </Card>
    )
  }

  const weakTricks = needsWork(stats)
    .map((slug) => TRICK_BY_SLUG[slug])
    .filter((t): t is Trick => !!t)

  return (
    <Screen title="Tricks" onBack={onBack} width={600}>
      <p className="-mt-4 mb-2 text-center text-sm text-muted">
        {TRICKS.length} tricks &amp; methods
      </p>
      {error && (
        <p className="text-error">Could not load proficiency: {error}</p>
      )}

      {weakTricks.length > 0 && (
        <section>
          <h3 className="mb-3 mt-4 border-b border-error/40 pb-1
            font-mono text-sm text-error">
            Needs work{' '}
            <span className="text-muted">({weakTricks.length})</span>
          </h3>
          {weakTricks.map(renderTrick)}
        </section>
      )}

      {CATEGORY_META.map(({ id, label }) => {
        const tricks = TRICKS.filter((t) => t.category === id)
        if (tricks.length === 0) return null
        const summary = categorySummary(tricks.map((t) => t.slug), stats)
        return (
          <section key={id}>
            <h3 className="mb-3 mt-7 flex items-baseline justify-between gap-3
              border-b border-success/40 pb-1 font-mono text-sm text-success">
              <span>
                {label}{' '}
                <span className="text-muted">({tricks.length})</span>
              </span>
              <span className="text-muted">
                {summary.practised}/{summary.total} practised
                {summary.practised > 0 &&
                  ` · avg ${Math.round(summary.avgProficiency * 100)}%`}
              </span>
            </h3>
            {tricks.map(renderTrick)}
          </section>
        )
      })}
    </Screen>
  )
}
```

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` reports no type errors and `vite build` completes.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — all tests green (no regressions).

- [ ] **Step 5: Lint**

Run: `cd frontend && npm run lint`
Expected: PASS — no eslint errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/ProgressBar.tsx frontend/src/components/TricksPage.tsx
git commit -m "feat: rebuild Tricks page as a per-trick mastery dashboard"
```

---

## Final verification

- [ ] Run the full frontend suite: `cd frontend && npx vitest run` — all green.
- [ ] Run the build: `cd frontend && npm run build` — succeeds.
- [ ] Run the Python suite (should be untouched): `uv run pytest -q` — 49 passed.
- [ ] Manual check (lead/reviewer): `cd frontend && npm run dev`, open the Tricks page — confirm the "Needs work" section, proficiency bars, category summaries, and "core method" badges render. Open Learn mode for `Two-digit × two-digit (criss-cross)` and confirm it generates 2-digit × 2-digit questions.

## Notes for the implementer

- The existing `tricks.test.ts` test `"each trick's generate() produces a question it applies to"` loops over **all** `TRICKS`, so it automatically covers every new trick's `generate`/`applies` pair and integer-answer guarantee — that is why per-task tests focus on registration, answer correctness, and detection behavior.
- Do not modify `frontend/src/lib/questionGenerator.ts`, any Python file, the DB schema, or the API. The backend stores trick slugs opaquely; new slugs work with no migration.
- Insertion-order matters only for catalog display. Keep general methods (`autoDetect: false`) first within their operation category, as the task steps specify.
