# Practice-Screen Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three practice-screen behaviors — instant correct-answer recognition, an "I don't know" skip, and a pause-with-trick-explanation on every miss.

**Architecture:** All logic stays in `PracticeScreen.tsx`. A small new presentational component, `TrickExplanation.tsx`, renders a trick's full lesson during the paused state. A skip is recorded as an ordinary incorrect `QuestionResult` (`givenAnswer: null`) — no backend, API, type, or scoring-model change.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite.

**Reference spec:** `docs/superpowers/specs/2026-05-22-practice-screen-improvements-design.md`

**Working branch:** `feat/practice-improvements` (already created and checked out).

---

## File Structure

**Created:**
- `frontend/src/components/TrickExplanation.tsx` — renders one trick's name + full lesson in a Sharp/Techy `Card`.

**Modified:**
- `frontend/src/components/PracticeScreen.tsx` — instant auto-submit on exact match; skip (button + Esc); pause-on-miss with `TrickExplanation` + `Next →` button; timer freezes on answer.
- `frontend/src/components/SummaryScreen.tsx` — review row shows `skipped` for a skipped question.

No other files change. No backend changes.

---

## Task 1: TrickExplanation component

**Files:**
- Create: `frontend/src/components/TrickExplanation.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/TrickExplanation.tsx` with exactly:

```tsx
import type { Trick } from '../lib/tricks'
import { Card } from './ui/Card'

interface Props {
  trick: Trick
}

/** The full explanation of a trick — shown when the user misses a question. */
export function TrickExplanation({ trick }: Props) {
  return (
    <Card className="mt-4 w-full max-w-[420px] p-4 text-left">
      <div className="mb-1 font-mono text-sm text-streak">💡 {trick.name}</div>
      <p className="whitespace-pre-line text-sm text-muted">{trick.lesson}</p>
    </Card>
  )
}
```

- [ ] **Step 2: Verify the build**

Run: `cd frontend && npm run build`
Expected: PASS. The component is unused so far but must typecheck and bundle.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TrickExplanation.tsx
git commit -m "feat: add TrickExplanation component"
```

---

## Task 2: PracticeScreen — auto-submit, skip, pause-on-miss

This task changes behavior:
- A correct answer is accepted the instant the typed digits equal it (no Enter).
- An "I don't know" button and the Esc key skip the question (recorded as incorrect, `givenAnswer: null`).
- A wrong answer or a skip stops on the trick explanation with a `Next →` button instead of auto-advancing; a correct answer still auto-advances after ~350 ms.
- The on-screen timer freezes once the question is answered.

**Files:**
- Modify: `frontend/src/components/PracticeScreen.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the ENTIRE contents of `frontend/src/components/PracticeScreen.tsx` with exactly:

```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Question, QuestionResult } from '../lib/types'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'
import { TRICK_BY_SLUG } from '../lib/tricks'
import { Button } from './ui/Button'
import { TrickExplanation } from './TrickExplanation'

interface Props {
  questionSource: () => Question
  total: number
  onComplete: (results: QuestionResult[]) => void
}

export function PracticeScreen({ questionSource, total, onComplete }: Props) {
  const TOTAL = total
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(() => questionSource())
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<null | 'correct' | string>(null)
  const [elapsed, setElapsed] = useState(0)
  const renderedAt = useRef(0)
  const firstKeyAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedRef = useRef(false)

  // a miss (wrong answer or skip): the screen pauses on the explanation
  const missed = feedback !== null && feedback !== 'correct'

  // stamp the render time for each question — done in an effect, not during
  // render, so the component stays pure (react-hooks/purity)
  useEffect(() => {
    renderedAt.current = performance.now()
  }, [question])

  // live timer — stops updating once the question has been answered
  useEffect(() => {
    const id = setInterval(() => {
      if (!submittedRef.current) {
        setElapsed(performance.now() - renderedAt.current)
      }
    }, 100)
    return () => clearInterval(id)
  }, [question])

  // clear a pending feedback->advance timer if we unmount before it fires
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        clearTimeout(feedbackTimerRef.current)
      }
    }
  }, [])

  // focus the input on every new question
  useEffect(() => {
    inputRef.current?.focus()
  }, [question])

  function nextQuestion(updated: SessionState) {
    if (isComplete(updated)) {
      onComplete(updated.results)
      return
    }
    setQuestion(questionSource())
    setInput('')
    setFeedback(null)
    firstKeyAt.current = null
    submittedRef.current = false
  }

  // `value` is null for a skip ("I don't know").
  function submit(value: number | null) {
    const now = performance.now()
    const isCorrect = value !== null && value === question.answer
    const result: QuestionResult = {
      question,
      givenAnswer: value,
      isCorrect,
      msToFirstKey: firstKeyAt.current
        ? Math.round(firstKeyAt.current - renderedAt.current)
        : null,
      msToSubmit: Math.round(now - renderedAt.current),
    }
    const updated = recordResult(session, result)
    setSession(updated)
    if (isCorrect) {
      setFeedback('correct')
      // brief flash, then advance
      feedbackTimerRef.current = setTimeout(() => nextQuestion(updated), 350)
    } else if (value === null) {
      setFeedback(`skipped — answer ${question.answer}`)
    } else {
      setFeedback(`answer ${question.answer}`)
    }
    // a miss does not auto-advance — the user continues via the Next button
  }

  function skip() {
    if (submittedRef.current) return
    submittedRef.current = true
    submit(null)
  }

  function onChange(raw: string) {
    if (submittedRef.current) return
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now()
    }
    setInput(digits)
    // instant recognition: accept the moment the typed value is correct
    if (digits.length > 0 && Number(digits) === question.answer) {
      submittedRef.current = true
      submit(Number(digits))
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      skip()
      return
    }
    if (e.key === 'Enter' && !submittedRef.current && input.length > 0) {
      submittedRef.current = true
      submit(Number(input))
    }
  }

  function handleNext() {
    nextQuestion(session)
  }

  const progress = `[${String(session.results.length + 1).padStart(2, '0')}`
    + `/${String(TOTAL).padStart(2, '0')}]`
  const seconds = (elapsed / 1000).toFixed(2)

  const inputBorder = feedback === 'correct'
    ? 'border-success'
    : feedback
      ? 'border-error'
      : 'border-accent'

  const trick = question.features.trickSlug
    ? TRICK_BY_SLUG[question.features.trickSlug]
    : undefined

  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center px-4 pt-[15vh]">
      <div className="flex w-full max-w-[300px] items-center gap-2.5">
        <span className="font-mono text-xs text-success">{progress}</span>
        <span className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs text-muted">{seconds}s</span>
      </div>

      <div className="mt-9 font-mono text-[44px] font-bold tracking-wide text-text">
        {question.prompt} =
      </div>

      <input
        ref={inputRef}
        value={input}
        inputMode="numeric"
        aria-label="Your answer"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={feedback !== null}
        className={`mt-6 w-[200px] rounded-md border bg-surface px-4 py-2.5 text-center
          font-mono text-3xl text-text caret-accent outline-none transition-colors
          duration-100 focus:shadow-[0_0_0_3px_rgba(47,129,247,0.18)]
          disabled:opacity-70 ${inputBorder}`}
      />

      <div className="mt-2 flex h-7 items-center gap-3 font-mono text-xs text-dim">
        {feedback === null && (
          <>
            <span>type the answer</span>
            <button
              onClick={skip}
              className="rounded border border-border-strong px-2 py-0.5 text-dim
                transition-colors hover:border-error hover:text-error"
            >
              I don't know (Esc)
            </button>
          </>
        )}
      </div>

      <div aria-live="polite" className="mt-1 h-7 font-mono text-sm">
        {feedback === 'correct' && <span className="text-success">✓ correct</span>}
        {missed && <span className="text-error">✗ {feedback}</span>}
      </div>

      {feedback === 'correct' && trick && (
        <div className="mt-1 h-7 text-sm text-streak">💡 {trick.tip}</div>
      )}

      {missed && (
        <>
          {trick && <TrickExplanation trick={trick} />}
          <Button
            variant="primary"
            autoFocus
            onClick={handleNext}
            className="mt-4 px-6 py-2"
          >
            Next →
          </Button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build, lint, and tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: build PASS; lint PASS (zero errors); all existing tests PASS.

- [ ] **Step 3: Manually verify the three behaviors**

Start the dev server (`cd frontend && npm run dev`, backend also running) and start a drill. Confirm:
- Typing the exact correct answer accepts it instantly with no Enter; a wrong/partial entry does NOT auto-submit and stays correctable with Backspace.
- The "I don't know" button and the Esc key both skip — the screen then pauses showing `✗ skipped — answer N`.
- A wrong answer and a skip both stop on the explanation (full trick lesson when the question has a trick) with a `Next →` button; Space/Enter and a click all advance it.
- A correct answer still auto-advances after a brief flash.
- The timer freezes the moment you answer.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PracticeScreen.tsx
git commit -m "feat: instant correct-answer recognition, skip, and pause-on-miss"
```

---

## Task 3: SummaryScreen — show "skipped" in the review

**Files:**
- Modify: `frontend/src/components/SummaryScreen.tsx`

- [ ] **Step 1: Update the review row**

In `frontend/src/components/SummaryScreen.tsx`, find this block:

```tsx
            {!r.isCorrect && (
              <span className="text-error">you: {r.givenAnswer ?? '—'}</span>
            )}
```

Replace it with:

```tsx
            {!r.isCorrect && (
              <span className="text-error">
                {r.givenAnswer === null ? 'skipped' : `you: ${r.givenAnswer}`}
              </span>
            )}
```

- [ ] **Step 2: Verify build, lint, and tests**

Run: `cd frontend && npm run build && npm run lint && npm test`
Expected: build PASS; lint PASS (zero errors); all existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SummaryScreen.tsx
git commit -m "feat: label skipped questions in the session review"
```

---

## Task 4: Full verification

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

- **Spec coverage:** Feature 1 (instant auto-submit) → Task 2 `onChange`. Feature 2 (skip button + Esc) → Task 2 `skip`/`onKeyDown`/skip button. Feature 3 (pause-on-miss + `TrickExplanation` + `Next →` + timer freeze) → Task 1 + Task 2. Summary "skipped" label → Task 3. No backend/API/model/type changes — consistent with the spec.
- **Type consistency:** `submit(value: number | null)`, `QuestionResult.givenAnswer: number | null`, `TRICK_BY_SLUG` → `Trick`, `TrickExplanation` prop `trick: Trick` — all consistent across tasks.
- **No placeholders:** every code step contains full file contents or an exact find-and-replace.
