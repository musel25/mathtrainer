# Review Applicable-Tricks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, for every question in the post-session review, the mental-math trick(s) that apply to it, with each row expandable to the full explanation.

**Architecture:** A pure `applicableTricks()` helper in `lib/tricks.ts` filters `TRICKS` by each trick's `applies()` predicate. A new `ReviewRow` component renders one expandable review row. `TrickExplanation` is refactored to a content-only block reused by both the practice screen and the review. Frontend-only — no backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-22-review-applicable-tricks-design.md`

**Working branch:** `feat/review-tricks` (already created and checked out).

---

## File Structure

**Created:**
- `frontend/src/components/ReviewRow.tsx` — one expandable review row.

**Modified:**
- `frontend/src/lib/tricks.ts` — add `applicableTricks()`.
- `frontend/src/lib/tricks.test.ts` — add its unit test.
- `frontend/src/components/TrickExplanation.tsx` — refactor to content-only + `className`.
- `frontend/src/components/PracticeScreen.tsx` — wrap `TrickExplanation` in a `Card`.
- `frontend/src/components/SummaryScreen.tsx` — use `<ReviewRow>` for the review list.

No backend changes.

---

## Task 1: `applicableTricks` helper (TDD)

**Files:**
- Modify: `frontend/src/lib/tricks.ts`
- Modify: `frontend/src/lib/tricks.test.ts`

- [ ] **Step 1: Write the failing test**

In `frontend/src/lib/tricks.test.ts`, change the import line:
```ts
import { TRICKS, TRICK_BY_SLUG, detectTrick } from './tricks'
```
to:
```ts
import { TRICKS, TRICK_BY_SLUG, detectTrick, applicableTricks } from './tricks'
```

Then find the final test block and the `describe` close:
```ts
  it('detectTrick finds an applicable trick and returns null otherwise', () => {
    const times11 = TRICK_BY_SLUG['times-11'].generate(Math.random)
    expect(detectTrick(times11)).toBe('times-11')
    expect(detectTrick({ operation: 'add', operands: [12, 34] })).toBeNull()
  })
})
```
Replace it with (adds one `it` block before the `describe` close):
```ts
  it('detectTrick finds an applicable trick and returns null otherwise', () => {
    const times11 = TRICK_BY_SLUG['times-11'].generate(Math.random)
    expect(detectTrick(times11)).toBe('times-11')
    expect(detectTrick({ operation: 'add', operands: [12, 34] })).toBeNull()
  })

  it('applicableTricks returns every trick that matches a question', () => {
    const q = TRICK_BY_SLUG['times-11'].generate(Math.random)
    const matches = applicableTricks(q)
    expect(matches.some((t) => t.slug === 'times-11')).toBe(true)
    for (const t of matches) {
      expect(t.applies(q)).toBe(true)
    }
    expect(applicableTricks({ operation: 'add', operands: [12, 34] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: FAIL — `applicableTricks` is not exported from `./tricks` (TypeScript/import error).

- [ ] **Step 3: Implement `applicableTricks`**

Append this exported function to the END of `frontend/src/lib/tricks.ts`:
```ts

/** Every trick whose rule matches the question — all shortcuts that apply. */
export function applicableTricks(
  q: Pick<Question, 'operation' | 'operands'>,
): Trick[] {
  return TRICKS.filter((t) => t.applies(q))
}
```
(`Question` and `Trick` are already in scope in `tricks.ts`: `Question` is imported at the top of the file, `Trick` is the exported interface, and `TRICKS` is the exported array.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/tricks.test.ts`
Expected: PASS — all trick-library tests pass, including the new one.

- [ ] **Step 5: Verify the full suite + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: all tests PASS; lint PASS (zero errors).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add applicableTricks helper"
```

---

## Task 2: Refactor TrickExplanation to content-only

**Files:**
- Modify: `frontend/src/components/TrickExplanation.tsx`
- Modify: `frontend/src/components/PracticeScreen.tsx`

- [ ] **Step 1: Rewrite `TrickExplanation.tsx`**

Replace the ENTIRE contents of `frontend/src/components/TrickExplanation.tsx` with:
```tsx
import type { Trick } from '../lib/tricks'

interface Props {
  trick: Trick
  className?: string
}

/** A trick's name + full lesson. The caller supplies the container. */
export function TrickExplanation({ trick, className = '' }: Props) {
  return (
    <div className={`text-left ${className}`.trim()}>
      <div className="mb-1 font-mono text-sm text-streak">💡 {trick.name}</div>
      <p className="whitespace-pre-line text-sm text-muted">{trick.lesson}</p>
    </div>
  )
}
```
(This removes the `Card` wrapper — `TrickExplanation` is now just the content.)

- [ ] **Step 2: Update the `TrickExplanation` usage in `PracticeScreen.tsx`**

In `frontend/src/components/PracticeScreen.tsx`, the import line currently is:
```tsx
import { Button } from './ui/Button'
```
Replace it with:
```tsx
import { Button } from './ui/Button'
import { Card } from './ui/Card'
```

Then find:
```tsx
      {missed && (
        <>
          {trick && <TrickExplanation trick={trick} />}
          <Button
```
Replace it with:
```tsx
      {missed && (
        <>
          {trick && (
            <Card className="mt-4 w-full max-w-[420px] p-4">
              <TrickExplanation trick={trick} />
            </Card>
          )}
          <Button
```

- [ ] **Step 3: Verify build, lint, tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: build PASS; lint PASS (zero errors); all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TrickExplanation.tsx frontend/src/components/PracticeScreen.tsx
git commit -m "refactor: make TrickExplanation a content-only block"
```

---

## Task 3: ReviewRow component

**Files:**
- Create: `frontend/src/components/ReviewRow.tsx`

- [ ] **Step 1: Create `ReviewRow.tsx`**

Create `frontend/src/components/ReviewRow.tsx` with exactly:
```tsx
import { useState } from 'react'
import type { QuestionResult } from '../lib/types'
import { applicableTricks } from '../lib/tricks'
import { TrickExplanation } from './TrickExplanation'

interface Props {
  result: QuestionResult
}

/** One row of the post-session review. Expands to show the trick(s) that
 *  apply to the question. */
export function ReviewRow({ result: r }: Props) {
  const [open, setOpen] = useState(false)
  const tricks = applicableTricks(r.question)
  const hasTricks = tricks.length > 0

  return (
    <div>
      <button
        type="button"
        disabled={!hasTricks}
        aria-expanded={hasTricks ? open : undefined}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left font-mono
          text-sm transition-colors enabled:hover:bg-bg disabled:cursor-default"
      >
        <span className={r.isCorrect ? 'text-success' : 'text-error'}>
          {r.isCorrect ? '✓' : '✗'}
        </span>
        <span className="flex-1 text-text">
          {r.question.prompt} = {r.question.answer}
          {hasTricks && (
            <span className="text-streak">
              {' · 💡 '}{tricks.map((t) => t.name).join(', ')}
            </span>
          )}
        </span>
        {!r.isCorrect && (
          <span className="text-error">
            {r.givenAnswer === null ? 'skipped' : `you: ${r.givenAnswer}`}
          </span>
        )}
        <span className="text-dim">{(r.msToSubmit / 1000).toFixed(1)}s</span>
        <span className="w-3 text-dim">
          {hasTricks ? (open ? '▾' : '▸') : ''}
        </span>
      </button>
      {open && (
        <div className="bg-bg px-3 py-3">
          {tricks.map((t) => (
            <TrickExplanation key={t.slug} trick={t} className="mb-3 last:mb-0" />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build, lint, tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: build PASS (the component is unused so far but must typecheck);
lint PASS (zero errors); all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReviewRow.tsx
git commit -m "feat: add expandable ReviewRow with applicable tricks"
```

---

## Task 4: Wire ReviewRow into SummaryScreen

**Files:**
- Modify: `frontend/src/components/SummaryScreen.tsx`

- [ ] **Step 1: Add the import**

In `frontend/src/components/SummaryScreen.tsx`, find:
```tsx
import { Card } from './ui/Card'
import { Button } from './ui/Button'
```
Replace it with:
```tsx
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { ReviewRow } from './ReviewRow'
```

- [ ] **Step 2: Replace the inline review rows**

Find this block:
```tsx
      <Card className="mb-6 divide-y divide-border">
        {results.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2 font-mono text-sm"
          >
            <span className={r.isCorrect ? 'text-success' : 'text-error'}>
              {r.isCorrect ? '✓' : '✗'}
            </span>
            <span className="flex-1 text-text">
              {r.question.prompt} = {r.question.answer}
            </span>
            {!r.isCorrect && (
              <span className="text-error">
                {r.givenAnswer === null ? 'skipped' : `you: ${r.givenAnswer}`}
              </span>
            )}
            <span className="text-dim">
              {(r.msToSubmit / 1000).toFixed(1)}s
            </span>
          </div>
        ))}
      </Card>
```
Replace it with:
```tsx
      <Card className="mb-6 divide-y divide-border">
        {results.map((r, i) => (
          <ReviewRow result={r} key={i} />
        ))}
      </Card>
```

- [ ] **Step 3: Verify build, lint, tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: build PASS; lint PASS (zero errors); all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SummaryScreen.tsx
git commit -m "feat: show applicable tricks per question in the session review"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend lint, test, build**

Run: `cd /home/musel/Github/mathtrainer/frontend && npm run lint && npm test && npm run build`
Expected: lint PASS (zero errors), all tests PASS, build PASS.

- [ ] **Step 2: Backend tests**

Run from the repo root: `cd /home/musel/Github/mathtrainer && uv run pytest -q`
Expected: all tests PASS (no backend changes were made).

- [ ] **Step 3: Report**

Report the exact results of Steps 1–2. Do not modify any files.

---

## Self-Review Notes

- **Spec coverage:** Feature 1 (`applicableTricks`) → Task 1. Feature 2 (`ReviewRow`) → Task 3. Feature 3 (`TrickExplanation` refactor) → Task 2. Feature 4 (`SummaryScreen` wiring) → Task 4. Unit test → Task 1. No backend changes — consistent with the spec.
- **Type consistency:** `applicableTricks(q: Pick<Question,'operation'|'operands'>): Trick[]` is defined in Task 1 and consumed in Task 3. `TrickExplanation` prop shape `{ trick: Trick; className?: string }` is defined in Task 2 and consumed by both PracticeScreen (Task 2) and ReviewRow (Task 3). `ReviewRow` prop `{ result: QuestionResult }` is defined in Task 3 and consumed in Task 4.
- **No placeholders:** every code step contains full file contents or an exact find-and-replace.
