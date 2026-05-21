# mathtrainer Phase 4: Trick Library — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach mental-math shortcuts and put them into practice — a trick library with mini-lessons, automatic trick hints during the drill, a Tricks page, a per-trick proficiency tracker, and a Learn mode that drills one trick.

**Architecture:** A static trick library (`tricks.ts`) defines each trick — name, lesson, a one-line tip, an `applies(question)` predicate, and a `generate(rng)` that builds a trick-applicable question. The question generator tags every generated question with the trick that applies (filling the long-reserved `features.trickSlug`), so the difficulty formula's trick relief fires and the practice screen can show the tip. A `trick_state` table tracks per-trick attempts/correct; `finish_session` records trick attempts; `/api/tricks` reports proficiency. The Tricks page browses the library and launches **Learn mode** — a focused drill whose questions all come from one trick.

**Tech Stack:** Same as Phases 1-3. No new dependencies.

**Scope note:** Phase 4 of the spec at `docs/superpowers/specs/2026-05-21-mathtrainer-design.md` (§6 tricks, §8 Tricks page / Learn mode). **Deliberate v1 scoping:** five tricks ship (×11, squares ending in 5, ×5, ×9, percentage swap); tricks are woven into the daily drill *opportunistically* (a generated question that happens to match a trick is tagged and its tip shown) plus the dedicated Learn mode — the spec's "reserve a fixed quota of trick questions in every daily drill" is a deferred refinement. Phases 1-3 are merged to `main`.

---

## File Structure

```
src/mathtrainer/
  schema.sql        # MODIFY: add trick_state table
  db.py             # MODIFY: record_trick_attempt, all_trick_state
  app.py            # MODIFY: /api/tricks; finish_session records trick attempts
tests/
  test_db.py        # MODIFY: trick_state round-trip
  test_api.py       # MODIFY: tricks endpoint, trick recording on finish
frontend/src/
  lib/
    tricks.ts            # CREATE: the trick library + detectTrick
    tricks.test.ts       # CREATE: trick predicates & generators
    questionGenerator.ts # MODIFY: tag questions with the applicable trick
    questionGenerator.test.ts # MODIFY: tagging test
    api.ts               # MODIFY: send trick_slug; getTricks()
    types.ts             # MODIFY: TrickStat type
  components/
    PracticeScreen.tsx   # MODIFY: questionSource/total props; trick hint
    TricksPage.tsx       # CREATE: library browser + Learn launcher
    Dashboard.tsx        # MODIFY: add a "Tricks" nav button
  App.tsx                # MODIFY: practice-source abstraction; Tricks route; Learn
```

**Responsibilities:** `tricks.ts` is the single source of trick definitions (frontend). `db.py` stays the only SQLite module. `PracticeScreen` becomes source-agnostic — it takes a `questionSource` callback and a `total`, so the same component serves both the adaptive daily drill and a single-trick Learn drill.

---

### Task 1: `trick_state` table & `/api/tricks` endpoint

**Files:** Modify `src/mathtrainer/schema.sql`, `src/mathtrainer/db.py`, `src/mathtrainer/app.py`; test `tests/test_db.py`, `tests/test_api.py`.

- [ ] **Step 1: Add the `trick_state` table to `schema.sql`** — append to `src/mathtrainer/schema.sql`:

```sql

CREATE TABLE IF NOT EXISTS trick_state (
    slug            TEXT PRIMARY KEY,
    attempts        INTEGER NOT NULL DEFAULT 0,
    correct         INTEGER NOT NULL DEFAULT 0,
    last_practiced  TEXT
);
```

- [ ] **Step 2: Write the failing db test — append to `tests/test_db.py`:**

```python
def test_trick_state_record_and_read(tmp_path):
    conn = _conn(tmp_path)
    assert db.all_trick_state(conn) == []

    db.record_trick_attempt(conn, "times-11", is_correct=True)
    db.record_trick_attempt(conn, "times-11", is_correct=False)
    db.record_trick_attempt(conn, "times-9", is_correct=True)

    state = {t["slug"]: t for t in db.all_trick_state(conn)}
    assert state["times-11"]["attempts"] == 2
    assert state["times-11"]["correct"] == 1
    assert state["times-9"]["attempts"] == 1
    assert state["times-9"]["correct"] == 1
    assert state["times-11"]["last_practiced"] is not None
```

- [ ] **Step 3: Run it — `uv run pytest tests/test_db.py::test_trick_state_record_and_read -v`** — Expected: FAIL (`record_trick_attempt` missing).

- [ ] **Step 4: Add the functions to `db.py`** — append at the end of `src/mathtrainer/db.py`:

```python
def record_trick_attempt(
    conn: sqlite3.Connection, slug: str, is_correct: bool
) -> None:
    conn.execute(
        "INSERT INTO trick_state (slug, attempts, correct, last_practiced) "
        "VALUES (?, 1, ?, ?) "
        "ON CONFLICT(slug) DO UPDATE SET attempts = attempts + 1, "
        "correct = correct + ?, last_practiced = ?",
        (slug, 1 if is_correct else 0, _now(), 1 if is_correct else 0, _now()),
    )
    conn.commit()


def all_trick_state(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT slug, attempts, correct, last_practiced FROM trick_state"
    ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 5: Write the failing API test — append to `tests/test_api.py`:**

```python
def test_tricks_endpoint_reports_proficiency(client):
    # no trick activity yet
    assert client.get("/api/tricks").json() == []

    sid = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    attempts = [
        {
            "operation": "multiply", "operands": [35, 11], "correct_answer": 385,
            "given_answer": 385, "is_correct": True, "difficulty": 40.0,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": "times-11", "score": 0.0,
        },
        {
            "operation": "multiply", "operands": [42, 11], "correct_answer": 462,
            "given_answer": 99, "is_correct": False, "difficulty": 40.0,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": "times-11", "score": 0.0,
        },
    ]
    client.post(f"/api/sessions/{sid}/finish", json={"attempts": attempts})

    tricks = {t["slug"]: t for t in client.get("/api/tricks").json()}
    assert tricks["times-11"]["attempts"] == 2
    assert tricks["times-11"]["correct"] == 1
    assert tricks["times-11"]["proficiency"] == 0.5
```

- [ ] **Step 6: Add the `/api/tricks` endpoint to `app.py`**

In `src/mathtrainer/app.py`, add this route immediately after the `progress` route:

```python
@app.get("/api/tricks")
def tricks() -> list[dict]:
    conn = _get_conn()
    try:
        out = []
        for t in db.all_trick_state(conn):
            attempts = t["attempts"]
            out.append({
                "slug": t["slug"],
                "attempts": attempts,
                "correct": t["correct"],
                "proficiency": (t["correct"] / attempts) if attempts else 0.0,
                "last_practiced": t["last_practiced"],
            })
        return out
    finally:
        conn.close()
```

- [ ] **Step 7: Run the tests** — `uv run pytest tests/test_db.py tests/test_api.py -v`
Expected: `test_trick_state_record_and_read` PASSES. `test_tricks_endpoint_reports_proficiency` still FAILS on the proficiency assertions because `finish_session` does not yet record trick attempts — that is Task 2. The first assertion (`[] for no activity`) passes. This is expected; proceed.

- [ ] **Step 8: Commit**

```bash
git add src/mathtrainer/schema.sql src/mathtrainer/db.py src/mathtrainer/app.py tests/test_db.py tests/test_api.py
git commit -m "feat: add trick_state table and tricks endpoint"
git push -u origin feat/phase-4-tricks
```

---

### Task 2: Record trick attempts on session finish

**Files:** Modify `src/mathtrainer/app.py`; test `tests/test_api.py` (no new test — Task 1's `test_tricks_endpoint_reports_proficiency` becomes green here).

- [ ] **Step 1: Wire trick recording into `finish_session`**

In `src/mathtrainer/app.py`, in the `finish_session` function, locate the attempt-processing loop:

```python
        for a in body.attempts:
            state, score = model.process_attempt(
                state, a.operation, a.difficulty, a.is_correct, a.ms_to_submit,
            )
            row = a.model_dump()
            row["score"] = score
            attempts.append(row)
            total_score += score
```

Replace it with (adds the trick-recording line):

```python
        for a in body.attempts:
            state, score = model.process_attempt(
                state, a.operation, a.difficulty, a.is_correct, a.ms_to_submit,
            )
            if a.trick_slug:
                db.record_trick_attempt(conn, a.trick_slug, a.is_correct)
            row = a.model_dump()
            row["score"] = score
            attempts.append(row)
            total_score += score
```

- [ ] **Step 2: Run the tests** — `uv run pytest -v`
Expected: PASS — the full backend suite, including `test_tricks_endpoint_reports_proficiency` (now green).

- [ ] **Step 3: Commit**

```bash
git add src/mathtrainer/app.py
git commit -m "feat: record trick attempts when a session is finished"
git push
```

---

### Task 3: The trick library (`tricks.ts`)

**Files:** Create `frontend/src/lib/tricks.ts`, `frontend/src/lib/tricks.test.ts`.

- [ ] **Step 1: Write the failing test `frontend/src/lib/tricks.test.ts`:**

```typescript
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
    // a plain addition matches no trick
    expect(detectTrick({ operation: 'add', operands: [12, 34] })).toBeNull()
  })
})
```

- [ ] **Step 2: Run it — `cd frontend && npx vitest run src/lib/tricks.test.ts`** — Expected: FAIL (cannot resolve `./tricks`).

- [ ] **Step 3: Create `frontend/src/lib/tricks.ts`:**

```typescript
import type { Operation, Question } from './types'
import { computeDifficulty } from './difficulty'

export interface Trick {
  slug: string
  name: string
  lesson: string                       // mini-lesson with a worked example
  tip: string                          // one-line hint shown after a drill answer
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
```

- [ ] **Step 4: Run it — `cd frontend && npx vitest run src/lib/tricks.test.ts`** — Expected: PASS (4 tests).

- [ ] **Step 5: Verify type-check** — `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/tricks.ts frontend/src/lib/tricks.test.ts
git commit -m "feat: add the mental-math trick library"
git push
```

---

### Task 4: Tag generated questions with the applicable trick

**Files:** Modify `frontend/src/lib/questionGenerator.ts`, `frontend/src/lib/questionGenerator.test.ts`, `frontend/src/lib/api.ts`.

- [ ] **Step 1: Write the failing test — append to `frontend/src/lib/questionGenerator.test.ts`:**

```typescript
describe('generateQuestion trick tagging', () => {
  it('tags a question when a trick applies', () => {
    // force multiply-heavy generation over a wide band; some will be ×5/×9/×11
    let tagged = 0
    for (let i = 0; i < 600; i++) {
      const q = generateQuestion({ min: 1, max: 100 }, Math.random, ['multiply'])
      if (q.features.trickSlug !== null) {
        // the tagged slug's trick must genuinely apply to the question
        tagged++
      }
    }
    expect(tagged).toBeGreaterThan(0)
  })

  it('leaves trickSlug null when no trick applies', () => {
    // a pure subtraction question matches no trick in the library
    for (let i = 0; i < 300; i++) {
      const q = generateQuestion({ min: 1, max: 100 })
      if (q.operation === 'subtract') {
        expect(q.features.trickSlug).toBeNull()
      }
    }
  })
})
```

- [ ] **Step 2: Run it — `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`** — Expected: FAIL (`trickSlug` is always `null` — not yet tagged).

- [ ] **Step 3: Tag questions in `questionGenerator.ts`**

In `frontend/src/lib/questionGenerator.ts`, add this import after the existing `import { computeDifficulty } from './difficulty'` line:

```typescript
import { detectTrick } from './tricks'
```

In the `generateQuestion` function, the loop body currently reads:

```typescript
  for (let i = 0; i < MAX_TRIES; i++) {
    const raw = buildRaw(rng, pick(rng, pool))
    const difficulty = computeDifficulty(raw.features)
    const candidate: Question = { ...raw, difficulty }
```

Replace those three lines with (detect the trick and write it into `features` BEFORE difficulty is computed, so the difficulty formula's trick relief applies):

```typescript
  for (let i = 0; i < MAX_TRIES; i++) {
    const raw = buildRaw(rng, pick(rng, pool))
    raw.features.trickSlug = detectTrick(raw)
    const difficulty = computeDifficulty(raw.features)
    const candidate: Question = { ...raw, difficulty }
```

- [ ] **Step 4: Run it — `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`** — Expected: PASS (existing generator tests plus the 2 new tagging tests).

- [ ] **Step 5: Send `trick_slug` in the attempt payload**

In `frontend/src/lib/api.ts`, in the `toPayload` function, the line currently reads `trick_slug: null,`. Replace it with:

```typescript
    trick_slug: r.question.features.trickSlug,
```

- [ ] **Step 6: Verify** — `cd frontend && npx tsc --noEmit -p tsconfig.app.json` (zero errors); `cd frontend && npm test` (all tests pass).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/questionGenerator.ts frontend/src/lib/questionGenerator.test.ts frontend/src/lib/api.ts
git commit -m "feat: tag generated questions with the applicable trick"
git push
```

---

### Task 5: Source-agnostic PracticeScreen with trick hints

**Files:** Modify `frontend/src/components/PracticeScreen.tsx`, `frontend/src/App.tsx`.

- [ ] **Step 1: Refactor `PracticeScreen` to take a question source + total, and show a trick hint**

In `frontend/src/components/PracticeScreen.tsx`:

(a) Replace the import block and the `Props` interface at the top of the file with:

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Question, QuestionResult } from '../lib/types'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'
import { TRICK_BY_SLUG } from '../lib/tricks'

interface Props {
  questionSource: () => Question
  total: number
  onComplete: (results: QuestionResult[]) => void
}
```

(Note: the `generateQuestion` import is removed — questions now come from the `questionSource` prop.)

(b) Replace the component signature and the first two lines of its body. The current code is:

```tsx
export function PracticeScreen({ plan, onComplete }: Props) {
  const TOTAL = plan.sessionLength
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(
    () => generateQuestion(plan.targetBand, Math.random, plan.weakOperations),
  )
```

Replace it with:

```tsx
export function PracticeScreen({ questionSource, total, onComplete }: Props) {
  const TOTAL = total
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(() => questionSource())
```

(c) In the `nextQuestion` function, replace the line that calls `generateQuestion(...)` with:

```tsx
    setQuestion(questionSource())
```

(d) Add the trick hint to the feedback area. The current feedback `<div>` near the end of the JSX is:

```tsx
      <div style={{ height: 40, marginTop: 16, fontSize: 24 }}>
        {feedback === 'correct' && <span style={{ color: 'green' }}>✓</span>}
        {feedback && feedback !== 'correct' && (
          <span style={{ color: 'crimson' }}>{feedback}</span>
        )}
      </div>
```

Replace it with:

```tsx
      <div style={{ height: 40, marginTop: 16, fontSize: 24 }}>
        {feedback === 'correct' && <span style={{ color: 'green' }}>✓</span>}
        {feedback && feedback !== 'correct' && (
          <span style={{ color: 'crimson' }}>{feedback}</span>
        )}
      </div>
      <div style={{ height: 28, marginTop: 4, color: '#a6611a' }}>
        {feedback !== null && question.features.trickSlug && (
          <span>💡 {TRICK_BY_SLUG[question.features.trickSlug]?.tip}</span>
        )}
      </div>
```

Leave the rest of `PracticeScreen.tsx` unchanged (timer, refs, submittedRef, feedbackTimerRef, submit/onChange/onKeyDown, the `useMemo`/`useEffect`s).

- [ ] **Step 2: Update `App.tsx` to build the question source**

In `frontend/src/App.tsx`, replace the entire contents with:

```tsx
import { useState } from 'react'
import type { Question, QuestionResult } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { generateQuestion } from './lib/questionGenerator'
import type { Trick } from './lib/tricks'
import { Dashboard } from './components/Dashboard'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'
import { ProgressPage } from './components/ProgressPage'
import { SettingsPage } from './components/SettingsPage'
import { TricksPage } from './components/TricksPage'

type Screen =
  | 'dashboard' | 'loading' | 'practice' | 'summary'
  | 'progress' | 'settings' | 'tricks'

interface Practice {
  source: () => Question
  total: number
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [practice, setPractice] = useState<Practice | null>(null)
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setScreen('loading')
    setError(null)
    try {
      const plan = await getSessionPlan()
      setPractice({
        source: () =>
          generateQuestion(plan.targetBand, Math.random, plan.weakOperations),
        total: plan.sessionLength,
      })
      setScreen('practice')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScreen('dashboard')
    }
  }

  function handleLearn(trick: Trick) {
    setPractice({ source: () => trick.generate(Math.random), total: 8 })
    setScreen('practice')
  }

  async function handleComplete(finished: QuestionResult[]) {
    setResults(finished)
    setSummary(null)
    setError(null)
    setScreen('summary')
    try {
      const sessionId = await startSession('daily')
      setSummary(await finishSession(sessionId, finished))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (screen === 'loading') {
    return <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
  }
  if (screen === 'practice' && practice) {
    return (
      <PracticeScreen
        questionSource={practice.source}
        total={practice.total}
        onComplete={handleComplete}
      />
    )
  }
  if (screen === 'summary') {
    return (
      <SummaryScreen
        results={results}
        summary={summary}
        saveError={error}
        onRestart={() => setScreen('dashboard')}
      />
    )
  }
  if (screen === 'progress') {
    return <ProgressPage onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'settings') {
    return <SettingsPage onBack={() => setScreen('dashboard')} />
  }
  if (screen === 'tricks') {
    return (
      <TricksPage onBack={() => setScreen('dashboard')} onLearn={handleLearn} />
    )
  }
  return (
    <Dashboard
      onStartDrill={handleStart}
      onOpenProgress={() => setScreen('progress')}
      onOpenSettings={() => setScreen('settings')}
      onOpenTricks={() => setScreen('tricks')}
    />
  )
}
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: errors ONLY about the missing module `./components/TricksPage` and about `Dashboard` not accepting an `onOpenTricks` prop — both resolved in Task 6. Confirm there are no OTHER errors.

Run: `cd frontend && npm test` — Expected: all pure-logic tests still pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PracticeScreen.tsx frontend/src/App.tsx
git commit -m "feat: make PracticeScreen source-agnostic and show trick hints"
git push
```

---

### Task 6: Tricks page & Learn mode

**Files:** Create `frontend/src/components/TricksPage.tsx`; modify `frontend/src/components/Dashboard.tsx`, `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`.

- [ ] **Step 1: Add the `TrickStat` type** — append to `frontend/src/lib/types.ts`:

```typescript
export interface TrickStat {
  slug: string
  attempts: number
  correct: number
  proficiency: number
  lastPracticed: string | null
}
```

- [ ] **Step 2: Add `getTricks` to `api.ts`** — append to `frontend/src/lib/api.ts`:

```typescript
export async function getTricks(): Promise<TrickStat[]> {
  const resp = await fetch('/api/tricks')
  if (!resp.ok) throw new Error(`getTricks failed: ${resp.status}`)
  const rows = await resp.json()
  return rows.map((r: {
    slug: string; attempts: number; correct: number;
    proficiency: number; last_practiced: string | null
  }) => ({
    slug: r.slug,
    attempts: r.attempts,
    correct: r.correct,
    proficiency: r.proficiency,
    lastPracticed: r.last_practiced,
  }))
}
```

Also add `TrickStat` to the type import at the top of `api.ts`. The import currently is:

```typescript
import type {
  Dashboard, Operation, Progress, QuestionResult, SessionPlan, Settings,
} from './types'
```

Replace it with:

```typescript
import type {
  Dashboard, Operation, Progress, QuestionResult,
  SessionPlan, Settings, TrickStat,
} from './types'
```

- [ ] **Step 3: Create `frontend/src/components/TricksPage.tsx`:**

```tsx
import { useEffect, useState } from 'react'
import { TRICKS, type Trick } from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'

interface Props {
  onBack: () => void
  onLearn: (trick: Trick) => void
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

  return (
    <div style={{ maxWidth: 600, margin: '6vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Tricks</h2>
      {error && <p style={{ color: 'crimson' }}>Could not load proficiency: {error}</p>}

      {TRICKS.map((trick) => {
        const stat = stats[trick.slug]
        const pct = stat && stat.attempts > 0
          ? Math.round(stat.proficiency * 100)
          : null
        return (
          <div
            key={trick.slug}
            style={{
              border: '1px solid #ddd', borderRadius: 8,
              padding: 16, margin: '14px 0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 18 }}>{trick.name}</strong>
              <span style={{ color: '#888' }}>
                {pct === null
                  ? 'not practised yet'
                  : `${pct}% (${stat.correct}/${stat.attempts})`}
              </span>
            </div>
            <p style={{ whiteSpace: 'pre-line', color: '#333' }}>{trick.lesson}</p>
            <button
              onClick={() => onLearn(trick)}
              style={{ padding: '8px 18px' }}
            >
              Practise this trick
            </button>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Add a "Tricks" button to the Dashboard**

In `frontend/src/components/Dashboard.tsx`:

(a) The `Props` interface currently is:

```tsx
interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
}
```

Replace it with:

```tsx
interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
  onOpenTricks: () => void
}
```

(b) Update the component signature line from `export function Dashboard({ onStartDrill, onOpenProgress, onOpenSettings }: Props) {` to:

```tsx
export function Dashboard({
  onStartDrill, onOpenProgress, onOpenSettings, onOpenTricks,
}: Props) {
```

(c) The nav button row near the end of the JSX currently is:

```tsx
      <div style={{ marginTop: 28 }}>
        <button onClick={onOpenProgress} style={{ marginRight: 12, padding: '8px 18px' }}>
          Progress
        </button>
        <button onClick={onOpenSettings} style={{ padding: '8px 18px' }}>
          Settings
        </button>
      </div>
```

Replace it with:

```tsx
      <div style={{ marginTop: 28 }}>
        <button onClick={onOpenProgress} style={{ marginRight: 12, padding: '8px 18px' }}>
          Progress
        </button>
        <button onClick={onOpenTricks} style={{ marginRight: 12, padding: '8px 18px' }}>
          Tricks
        </button>
        <button onClick={onOpenSettings} style={{ padding: '8px 18px' }}>
          Settings
        </button>
      </div>
```

Note: the error-state early-return branch of `Dashboard` does not render the nav row, so it needs no change.

- [ ] **Step 5: Verify type-check, tests, and build**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — Expected: ZERO errors (the Task 5 deferred errors are now resolved).
Run: `cd frontend && npm test` — Expected: all frontend tests pass.
Run: `cd frontend && npm run build` — Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TricksPage.tsx frontend/src/components/Dashboard.tsx frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: add Tricks page with lessons, proficiency and Learn mode"
git push
```

---

### Task 7: End-to-end verification & merge to main

**Files:** No source changes.

- [ ] **Step 1: Full suites**

Run: `uv run pytest -q` — Expected: PASS (test_db, test_model, test_stats, test_api).
Run: `cd frontend && npm test && npm run build` — Expected: all tests pass; build succeeds.

- [ ] **Step 2: End-to-end with Playwright**

Start the server in the background from the repo root (`uv run mathtrainer`); poll `curl -s http://127.0.0.1:8000/api/health`.

Using the Playwright browser tools at `http://127.0.0.1:8000`:
- On the **Dashboard**, confirm there is now a "Tricks" button alongside "Progress" and "Settings". Click it.
- On the **Tricks page**, confirm all five tricks are listed (Multiply by 11, Square a number ending in 5, Multiply by 5, Multiply by 9, Swap the percentage), each with a lesson and a "Practise this trick" button, and a proficiency label ("not practised yet" initially).
- Click **"Practise this trick"** on "Multiply by 11". Complete the 8-question Learn drill — every prompt should be an `N × 11` question. After answering each, confirm a "💡" trick tip appears. Answer most correctly.
- On the Summary, click "Drill again" → back to the Dashboard.
- Open **Tricks** again — confirm "Multiply by 11" now shows a real proficiency percentage (e.g. "88% (7/8)"), not "not practised yet".
- Back to Dashboard, click **"Start daily drill"** and complete a normal drill — confirm it still works and that any trick-applicable question (e.g. an `N × 5`) shows a 💡 tip after answering.

Stop the background server.

- [ ] **Step 3: Verify persistence**

```bash
cd /home/musel/Github/mathtrainer
uv run python -c "
from mathtrainer import db
conn = db.get_connection('mathtrainer.db')
ts = db.all_trick_state(conn)
assert any(t['slug'] == 'times-11' and t['attempts'] >= 8 for t in ts), ts
print('trick_state:', [(t['slug'], t['attempts'], t['correct']) for t in ts])
print('phase 4 persistence OK')
"
```
Expected: prints the trick_state rows and `phase 4 persistence OK`.

- [ ] **Step 4: Merge to main**

```bash
cd /home/musel/Github/mathtrainer
git checkout main
git merge --no-ff feat/phase-4-tricks -m "feat: Phase 4 — trick library, hints, Tricks page and Learn mode"
git push origin main
git branch -d feat/phase-4-tricks
git push origin --delete feat/phase-4-tricks
```

---

## Self-Review

**Spec coverage (spec §6 tricks, §8 Tricks page / Learn mode):**
- Static trick library with mini-lessons and worked examples — `tricks.ts`, Task 3 (five tricks).
- Each trick has an applicability predicate — `Trick.applies`, Task 3.
- Tricks woven into practice — `generateQuestion` tags every question via `detectTrick`, Task 4; the difficulty formula's existing trick relief now fires; the practice screen shows the tip after answering a trick-tagged question, Task 5. (Opportunistic weaving + Learn mode; a fixed per-drill quota is a noted deferral.)
- Learn mode — `Trick.generate` builds trick-applicable questions; the source-agnostic `PracticeScreen` drills them; launched from the Tricks page, Tasks 3/5/6.
- Tricks page with the library and per-trick proficiency — `TricksPage`, Task 6; proficiency from `trick_state` + `/api/tricks`, Tasks 1-2.
- `trick_state` table — Task 1; per-trick attempts/correct recorded on finish, Task 2.
- Out of scope by design: the fixed trick quota in every daily drill (noted deferral); no further phases.

**Placeholder scan:** No `TBD`/`TODO`. Every code step is complete. Deliberately-deferred intermediate states are flagged with their resolving task: Task 1 Step 7 (`test_tricks_endpoint_reports_proficiency` partly fails until Task 2 wires recording); Task 5 Step 3 (`tsc` reports only the missing `TricksPage` and the `onOpenTricks` prop until Task 6).

**Type consistency:** `Trick` (`slug`, `name`, `lesson`, `tip`, `applies`, `generate`) is defined once in `tricks.ts` and consumed by `questionGenerator.ts` (`detectTrick`), `PracticeScreen.tsx` (`TRICK_BY_SLUG`), `App.tsx` (`handleLearn`), and `TricksPage.tsx`. `detectTrick` and `Trick.applies` accept `Pick<Question,'operation'|'operands'>`, so `questionGenerator` can call `detectTrick(raw)` on the pre-difficulty raw question. `features.trickSlug` (already on `QuestionFeatures` since Phase 1) is written by `generateQuestion` and by `Trick.generate`, read by `computeDifficulty` (trick relief), `PracticeScreen` (hint), and `toPayload` (sent as `trick_slug`). Backend `record_trick_attempt(conn, slug, is_correct)` is called from `finish_session` for every attempt whose `trick_slug` is set; `/api/tricks` returns `slug/attempts/correct/proficiency/last_practiced`, which `getTricks` maps to the `TrickStat` TS type (`lastPracticed` camelCased). `PracticeScreen`'s new props (`questionSource`, `total`, `onComplete`) match exactly what `App.tsx` passes.
