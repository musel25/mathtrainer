# Sharp/Techy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mathtrainer's unstyled inline-style UI with a cohesive dark "Sharp/Techy" design system, and fold in three coupled UX fixes.

**Architecture:** Introduce Tailwind CSS v4 with design tokens declared in a single `@theme` block. Hand-build ~5 small presentational components in `frontend/src/components/ui/`. Rewrite all 7 screen components to use Tailwind classes + those primitives. Bundle Space Mono + Inter via `@fontsource` (no runtime CDN).

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`), recharts 3, `@fontsource/space-mono`, `@fontsource/inter`.

**Reference spec:** `docs/superpowers/specs/2026-05-22-sharp-techy-redesign-design.md`

**Working branch:** `feat/sharp-techy-redesign` (already created and checked out).

---

## File Structure

**Created:**
- `frontend/src/index.css` — Tailwind import, `@theme` tokens, base styles
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Card.tsx`
- `frontend/src/components/ui/StatTile.tsx`
- `frontend/src/components/ui/ProgressBar.tsx`
- `frontend/src/components/ui/Screen.tsx`

**Modified:**
- `frontend/package.json` — new deps (via npm install)
- `frontend/vite.config.ts` — add Tailwind plugin
- `frontend/index.html` — dark color-scheme, no-flash background
- `frontend/src/main.tsx` — import fonts + `index.css`
- `frontend/src/App.tsx` — restyle the loading state
- `frontend/src/components/Dashboard.tsx`
- `frontend/src/components/CalendarHeatmap.tsx`
- `frontend/src/components/PracticeScreen.tsx`
- `frontend/src/components/SummaryScreen.tsx`
- `frontend/src/components/ProgressPage.tsx`
- `frontend/src/components/SettingsPage.tsx`
- `frontend/src/components/TricksPage.tsx`

No backend changes. No changes to `frontend/src/lib/` logic.

**Note on fonts:** The spec mentions hand-placed woff2 files + `@font-face`. This plan uses `@fontsource` packages instead — they bundle the same woff2 files into the Vite build (no runtime CDN), which satisfies the spec's intent with less manual work.

---

## Task 1: Tailwind v4 + design tokens + fonts

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/index.html`
- Modify: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`

- [ ] **Step 1: Install dependencies**

Run from `frontend/`:
```bash
cd frontend && npm install @fontsource/space-mono @fontsource/inter && npm install -D tailwindcss @tailwindcss/vite
```
Expected: packages added, no errors.

- [ ] **Step 2: Add the Tailwind plugin to Vite**

Replace the entire contents of `frontend/vite.config.ts` with:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'node' },
})
```

- [ ] **Step 3: Create the global stylesheet**

Create `frontend/src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: #0d1117;
  --color-surface: #161b22;
  --color-border: #21262d;
  --color-border-strong: #30363d;
  --color-text: #e6edf3;
  --color-muted: #7d8590;
  --color-dim: #484f58;
  --color-accent: #2f81f7;
  --color-success: #3fb950;
  --color-error: #f85149;
  --color-streak: #d29922;

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Space Mono", ui-monospace, SFMono-Regular, monospace;

  --radius-md: 6px;
}

html, body, #root { height: 100%; }

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Import fonts and stylesheet in the entrypoint**

Replace the entire contents of `frontend/src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 5: Prevent a white flash before CSS loads**

Replace the entire contents of `frontend/index.html` with:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <style>html { background: #0d1117; }</style>
    <title>mathtrainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Verify the build**

Run: `cd frontend && npm run build`
Expected: PASS — `tsc -b` and `vite build` both succeed, `dist/` produced.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/index.html frontend/src/main.tsx frontend/src/index.css
git commit -m "chore: add Tailwind v4, design tokens, and bundled fonts"
```

---

## Task 2: UI primitive components

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/StatTile.tsx`
- Create: `frontend/src/components/ui/ProgressBar.tsx`
- Create: `frontend/src/components/ui/Screen.tsx`

- [ ] **Step 1: Create `Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white font-medium hover:brightness-110',
  ghost: 'border border-border-strong text-text hover:border-accent hover:text-accent',
  danger: 'border border-error/40 text-error hover:border-error',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'ghost', className = '', ...rest }: Props) {
  return (
    <button
      className={`rounded-md px-4 py-2 text-sm transition duration-100 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}
```

- [ ] **Step 2: Create `Card.tsx`**

```tsx
import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-border bg-surface ${className}`}
      {...rest}
    />
  )
}
```

- [ ] **Step 3: Create `StatTile.tsx`**

```tsx
interface Props {
  label: string
  value: string | number
  accent?: boolean
}

export function StatTile({ label, value, accent }: Props) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={`font-mono text-3xl ${accent ? 'text-accent' : 'text-text'}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 4: Create `ProgressBar.tsx`**

```tsx
interface Props {
  value: number
  max: number
  className?: string
}

export function ProgressBar({ value, max, className = '' }: Props) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className="h-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
```

- [ ] **Step 5: Create `Screen.tsx`**

```tsx
import type { ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  title?: string
  onBack?: () => void
  width?: number
  children: ReactNode
}

export function Screen({ title, onBack, width = 600, children }: Props) {
  return (
    <div className="mx-auto px-4 py-10" style={{ maxWidth: width }}>
      {onBack && (
        <Button onClick={onBack} className="mb-4">← Back</Button>
      )}
      {title && (
        <h2 className="mb-6 text-center font-mono text-xl text-text">{title}</h2>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Verify the build**

Run: `cd frontend && npm run build`
Expected: PASS (the new components are unused so far — they must still typecheck and bundle).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui
git commit -m "feat: add Sharp/Techy UI primitive components"
```

---

## Task 3: Restyle Dashboard + CalendarHeatmap

**Files:**
- Modify: `frontend/src/components/CalendarHeatmap.tsx`
- Modify: `frontend/src/components/Dashboard.tsx`
- Modify: `frontend/src/App.tsx` (loading state only)

- [ ] **Step 1: Rewrite `CalendarHeatmap.tsx`**

Replace the entire file:
```tsx
import type { HeatmapCell } from '../lib/types'

interface Props {
  cells: HeatmapCell[]
}

function shade(score: number, max: number): string {
  if (score <= 0) return '#21262d'
  const t = max > 0 ? score / max : 0
  if (t < 0.25) return '#0e4429'
  if (t < 0.5) return '#006d32'
  if (t < 0.75) return '#26a641'
  return '#3fb950'
}

/** A GitHub-style heatmap: 7 rows (days) by N columns (weeks). */
export function CalendarHeatmap({ cells }: Props) {
  const max = cells.reduce((m, c) => Math.max(m, c.score), 0)
  const weeks: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return (
    <div className="flex justify-center gap-[3px]">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.questions} questions`}
              className="h-3 w-3 rounded-[2px]"
              style={{ background: shade(c.score, max) }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `Dashboard.tsx`**

Replace the entire file:
```tsx
import { useEffect, useState } from 'react'
import type { Dashboard as DashboardData } from '../lib/types'
import { getDashboard } from '../lib/api'
import { CalendarHeatmap } from './CalendarHeatmap'
import { StatTile } from './ui/StatTile'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'
import { Line, LineChart } from 'recharts'

interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
  onOpenTricks: () => void
}

export function Dashboard({
  onStartDrill, onOpenProgress, onOpenSettings, onOpenTricks,
}: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-16 text-center">
        <h1 className="font-mono text-2xl">mathtrainer</h1>
        <p className="mt-4 text-error">Could not load dashboard: {error}</p>
        <Button variant="primary" onClick={onStartDrill} className="mt-6 px-7 py-3 text-base">
          › start drill
        </Button>
      </div>
    )
  }
  if (!data) {
    return <p className="py-32 text-center text-muted">Loading…</p>
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-12 text-center">
      <h1 className="font-mono text-2xl tracking-tight">mathtrainer</h1>

      <div className="my-8 flex justify-around">
        <StatTile label="Streak" value={data.streak} />
        <StatTile label="Rating" value={data.rating.toFixed(0)} accent />
        <StatTile label="Sessions" value={data.totalSessions} />
      </div>

      {data.ratingSparkline.length > 1 && (
        <div className="my-4">
          <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-muted">
            Rating trend
          </div>
          <div className="flex justify-center">
            <LineChart
              width={240}
              height={48}
              data={data.ratingSparkline.map((r, i) => ({ i, rating: r }))}
            >
              <Line
                type="monotone"
                dataKey="rating"
                stroke="#3fb950"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </div>
        </div>
      )}

      <div className="my-6 text-left">
        <div className="mb-1.5 font-mono text-xs text-muted">
          today  {data.today.questions}/{data.today.goal}
        </div>
        <ProgressBar value={data.today.questions} max={data.today.goal} />
      </div>

      <Button
        variant="primary"
        onClick={onStartDrill}
        className="px-7 py-3 text-base"
      >
        › start drill
      </Button>

      <div className="mb-2 mt-8 text-[10px] uppercase tracking-[0.12em] text-muted">
        Activity
      </div>
      <CalendarHeatmap cells={data.heatmap} />

      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={onOpenProgress}>Progress</Button>
        <Button onClick={onOpenTricks}>Tricks</Button>
        <Button onClick={onOpenSettings}>Settings</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Restyle the loading state in `App.tsx`**

In `frontend/src/App.tsx`, find the loading branch:
```tsx
  if (screen === 'loading') {
    return <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
  }
```
Replace it with:
```tsx
  if (screen === 'loading') {
    return <p className="py-32 text-center text-muted">Loading…</p>
  }
```

- [ ] **Step 4: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; all existing `lib/*.test.ts` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.tsx frontend/src/components/CalendarHeatmap.tsx frontend/src/App.tsx
git commit -m "feat: restyle Dashboard and CalendarHeatmap for Sharp/Techy theme"
```

---

## Task 4: Restyle PracticeScreen + fix auto-submit trap + accessibility

This task changes behavior: the practice input no longer auto-submits when the
typed length reaches the answer's digit count. It submits on **Enter only**.
This removes the mistyped-digit trap and stops leaking the answer's magnitude.
Timing capture (`msToFirstKey`, `msToSubmit`) is unchanged.

**Files:**
- Modify: `frontend/src/components/PracticeScreen.tsx`

- [ ] **Step 1: Rewrite `PracticeScreen.tsx`**

Replace the entire file:
```tsx
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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

export function PracticeScreen({ questionSource, total, onComplete }: Props) {
  const TOTAL = total
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(() => questionSource())
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<null | 'correct' | string>(null)
  const [elapsed, setElapsed] = useState(0)
  const renderedAt = useRef(performance.now())
  const firstKeyAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submittedRef = useRef(false)

  // live timer
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(performance.now() - renderedAt.current),
      100,
    )
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
    renderedAt.current = performance.now()
  }

  function submit(value: number) {
    const now = performance.now()
    const isCorrect = value === question.answer
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
    setFeedback(isCorrect ? 'correct' : `answer ${question.answer}`)
    // brief feedback pause, then advance
    feedbackTimerRef.current = setTimeout(
      () => nextQuestion(updated),
      isCorrect ? 350 : 1100,
    )
  }

  function onChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now()
    }
    setInput(digits)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !submittedRef.current && input.length > 0) {
      submittedRef.current = true
      submit(Number(input))
    }
  }

  const progress = `[${String(session.results.length + 1).padStart(2, '0')}`
    + `/${String(TOTAL).padStart(2, '0')}]`
  const seconds = (elapsed / 1000).toFixed(2)

  const inputBorder = feedback === 'correct'
    ? 'border-success'
    : feedback
      ? 'border-error'
      : 'border-accent'

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

      <div className="mt-2 h-4 font-mono text-xs text-dim">
        {feedback === null && 'press Enter'}
      </div>

      <div aria-live="polite" className="mt-1 h-7 font-mono text-sm">
        {feedback === 'correct' && <span className="text-success">✓ correct</span>}
        {feedback && feedback !== 'correct' && (
          <span className="text-error">✗ {feedback}</span>
        )}
      </div>

      <div className="mt-1 h-7 text-sm text-streak">
        {feedback !== null && question.features.trickSlug && (
          <span>💡 {TRICK_BY_SLUG[question.features.trickSlug]?.tip}</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; all existing tests PASS.

- [ ] **Step 3: Manually verify the behavior change**

Start the dev server: `cd frontend && npm run dev` (the backend must also be
running for the dashboard, but the practice screen can be reached via a drill).
Confirm:
- Typing a multi-digit answer does **not** auto-submit; pressing **Enter** submits.
- A mistyped digit can be corrected with Backspace before pressing Enter.
- The `[03/10]` counter and live `2.43s` timer update correctly.
- Correct shows green `✓ correct`; wrong shows red `✗ answer N`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PracticeScreen.tsx
git commit -m "feat: restyle PracticeScreen and fix auto-submit trap"
```

---

## Task 5: Restyle SummaryScreen + add per-question review

**Files:**
- Modify: `frontend/src/components/SummaryScreen.tsx`

- [ ] **Step 1: Rewrite `SummaryScreen.tsx`**

Replace the entire file:
```tsx
import type { QuestionResult } from '../lib/types'
import { createSession, recordResult, sessionStats } from '../lib/session'
import type { SessionSummary } from '../lib/api'
import { Card } from './ui/Card'
import { Button } from './ui/Button'

interface Props {
  results: QuestionResult[]
  summary: SessionSummary | null
  saveError: string | null
  onHome: () => void
  onDrillAgain: () => void
}

export function SummaryScreen({
  results, summary, saveError, onHome, onDrillAgain,
}: Props) {
  const stats = sessionStats(
    results.reduce((s, r) => recordResult(s, r), createSession(results.length)),
  )
  const ratingDelta = summary
    ? summary.rating_after - summary.rating_before
    : 0
  const up = ratingDelta >= 0

  return (
    <div className="mx-auto max-w-[480px] px-4 py-12">
      <h2 className="mb-6 text-center font-mono text-xl">session complete</h2>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Accuracy
          </div>
          <div className="font-mono text-2xl">
            {(stats.accuracy * 100).toFixed(0)}%
          </div>
          <div className="font-mono text-xs text-dim">
            {stats.correct}/{stats.answered}
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Avg time
          </div>
          <div className="font-mono text-2xl">
            {(stats.avgMsToSubmit / 1000).toFixed(1)}s
          </div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted">
            Rating
          </div>
          <div className={`font-mono text-2xl ${up ? 'text-success' : 'text-error'}`}>
            {summary
              ? `${up ? '▲' : '▼'}${Math.abs(ratingDelta).toFixed(1)}`
              : '—'}
          </div>
          {summary && (
            <div className="font-mono text-xs text-dim">
              {summary.rating_after.toFixed(1)}
            </div>
          )}
        </Card>
      </div>

      {summary && (
        <p className="mb-4 text-center font-mono text-xs text-dim">
          score {summary.total_score.toFixed(0)} · saved #{summary.session_id}
        </p>
      )}
      {summary && summary.weak_operations.length > 0 && (
        <p className="mb-4 text-center text-sm text-streak">
          Worth practising: {summary.weak_operations.join(', ')}
        </p>
      )}
      {saveError && (
        <p className="mb-4 text-center text-sm text-error">
          Save failed: {saveError}
        </p>
      )}

      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">
        Review
      </div>
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
              <span className="text-error">you: {r.givenAnswer ?? '—'}</span>
            )}
            <span className="text-dim">
              {(r.msToSubmit / 1000).toFixed(1)}s
            </span>
          </div>
        ))}
      </Card>

      <div className="flex justify-center gap-3">
        <Button onClick={onHome}>Home</Button>
        <Button variant="primary" onClick={onDrillAgain}>Drill again</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; all existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SummaryScreen.tsx
git commit -m "feat: restyle SummaryScreen with per-question answer review"
```

---

## Task 6: Restyle ProgressPage charts for dark theme

**Files:**
- Modify: `frontend/src/components/ProgressPage.tsx`

- [ ] **Step 1: Rewrite `ProgressPage.tsx`**

Replace the entire file:
```tsx
import { useEffect, useState, type ReactElement } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Operation, Progress } from '../lib/types'
import { getProgress } from '../lib/api'
import { Screen } from './ui/Screen'

// keep in sync with OPERATIONS in questionGenerator.ts and model.py
const OP_ORDER: Operation[] = [
  'add', 'subtract', 'multiply', 'divide', 'square', 'percent',
]

const AXIS = { fontFamily: 'Space Mono, monospace', fontSize: 11, fill: '#7d8590' }
const GRID = '#21262d'
const TOOLTIP = {
  contentStyle: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    fontFamily: 'Space Mono, monospace',
    fontSize: 12,
  },
  labelStyle: { color: '#7d8590' },
  itemStyle: { color: '#e6edf3' },
}
const CURSOR = { fill: 'rgba(255,255,255,0.04)' }

interface Props {
  onBack: () => void
}

function ChartBlock({ title, children }: {
  title: string
  children: ReactElement
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-2 font-mono text-sm text-muted">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

export function ProgressPage({ onBack }: Props) {
  const [data, setData] = useState<Progress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProgress()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <Screen title="Progress" onBack={onBack} width={640}>
      {error && (
        <p className="text-center text-error">Could not load progress: {error}</p>
      )}
      {!error && !data && (
        <p className="text-center text-muted">Loading…</p>
      )}
      {data && data.history.length === 0 && (
        <p className="text-center text-muted">
          No finished sessions yet — complete a drill to see your progress.
        </p>
      )}

      {data && data.history.length > 0 && (
        <>
          <ChartBlock title="Rating over time">
            <LineChart data={data.history}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="n" tick={AXIS} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="rating" stroke="#3fb950"
                strokeWidth={2} dot={false} />
            </LineChart>
          </ChartBlock>

          <ChartBlock title="Score per session">
            <LineChart data={data.history}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="n" tick={AXIS} stroke={GRID} />
              <YAxis tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} />
              <Line type="monotone" dataKey="score" stroke="#2f81f7"
                strokeWidth={2} dot={false} />
            </LineChart>
          </ChartBlock>

          <ChartBlock title="Average time per operation (s)">
            <BarChart
              data={data.operationTimes.map((o) => ({
                operation: o.operation,
                seconds: Number((o.avgMs / 1000).toFixed(2)),
              }))}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="operation" tick={AXIS} stroke={GRID} />
              <YAxis tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} cursor={CURSOR} />
              <Bar dataKey="seconds" fill="#d29922" />
            </BarChart>
          </ChartBlock>

          <ChartBlock title="Ability by operation">
            <BarChart
              data={OP_ORDER.map((op) => ({
                operation: op,
                // the API always returns all six operations; ?? 50 is a
                // defensive default (the cold-start rating) just in case
                rating: Math.round(data.operationRatings[op] ?? 50),
              }))}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="operation" tick={AXIS} stroke={GRID} />
              <YAxis domain={[0, 100]} tick={AXIS} stroke={GRID} />
              <Tooltip {...TOOLTIP} cursor={CURSOR} />
              <Bar dataKey="rating" fill="#3fb950" />
            </BarChart>
          </ChartBlock>
        </>
      )}
    </Screen>
  )
}
```

- [ ] **Step 2: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; all existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProgressPage.tsx
git commit -m "feat: restyle ProgressPage charts for dark theme"
```

---

## Task 7: Restyle SettingsPage + TricksPage

**Files:**
- Modify: `frontend/src/components/SettingsPage.tsx`
- Modify: `frontend/src/components/TricksPage.tsx`

- [ ] **Step 1: Rewrite `SettingsPage.tsx`**

Replace the entire file:
```tsx
import { useEffect, useState } from 'react'
import type { Settings } from '../lib/types'
import { getSettings, putSettings } from '../lib/api'
import { Screen } from './ui/Screen'
import { Button } from './ui/Button'

interface Props {
  onBack: () => void
}

const FIELD = 'mt-1.5 block w-32 rounded-md border border-border-strong '
  + 'bg-surface px-3 py-2 font-mono text-lg text-text caret-accent '
  + 'outline-none focus:border-accent'

export function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function save() {
    if (!settings) return
    setStatus(null)
    setError(null)
    try {
      await putSettings(settings)
      setStatus('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function update(patch: Partial<Settings>) {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    setStatus(null)
  }

  return (
    <Screen title="Settings" onBack={onBack} width={420}>
      {error && <p className="text-error">{error}</p>}
      {!error && !settings && <p className="text-muted">Loading…</p>}

      {settings && (
        <div className="flex flex-col gap-5">
          <label className="block text-sm text-text">
            Daily goal (questions per day)
            <input
              type="number" min={1}
              value={settings.dailyGoal}
              onChange={(e) => update({ dailyGoal: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <label className="block text-sm text-text">
            Questions per drill
            <input
              type="number" min={1} max={50}
              value={settings.sessionLength}
              onChange={(e) => update({ sessionLength: Number(e.target.value) })}
              className={FIELD}
            />
          </label>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={save}>Save</Button>
            {status && <span className="text-sm text-success">{status}</span>}
          </div>
        </div>
      )}
    </Screen>
  )
}
```

- [ ] **Step 2: Rewrite `TricksPage.tsx`**

Replace the entire file:
```tsx
import { useEffect, useState } from 'react'
import { TRICKS, CATEGORY_META, type Trick } from '../lib/tricks'
import { getTricks } from '../lib/api'
import type { TrickStat } from '../lib/types'
import { Screen } from './ui/Screen'
import { Card } from './ui/Card'
import { Button } from './ui/Button'

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

  function renderTrick(trick: Trick) {
    const stat = stats[trick.slug]
    const pct = stat && stat.attempts > 0
      ? Math.round(stat.proficiency * 100)
      : null
    return (
      <Card key={trick.slug} className="mb-3.5 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="text-base text-text">{trick.name}</strong>
          <span className="font-mono text-xs text-muted">
            {pct === null
              ? 'not practised'
              : `${pct}% (${stat.correct}/${stat.attempts})`}
          </span>
        </div>
        <p className="my-3 whitespace-pre-line text-sm text-muted">
          {trick.lesson}
        </p>
        <Button onClick={() => onLearn(trick)}>Practise this trick</Button>
      </Card>
    )
  }

  return (
    <Screen title="Tricks" onBack={onBack} width={600}>
      <p className="-mt-4 mb-2 text-center text-sm text-muted">
        {TRICKS.length} mental-math shortcuts
      </p>
      {error && (
        <p className="text-error">Could not load proficiency: {error}</p>
      )}

      {CATEGORY_META.map(({ id, label }) => {
        const tricks = TRICKS.filter((t) => t.category === id)
        if (tricks.length === 0) return null
        return (
          <section key={id}>
            <h3 className="mb-3 mt-7 border-b border-success/40 pb-1
              font-mono text-sm text-success">
              {label}{' '}
              <span className="text-muted">({tricks.length})</span>
            </h3>
            {tricks.map(renderTrick)}
          </section>
        )
      })}
    </Screen>
  )
}
```

- [ ] **Step 3: Verify build and tests**

Run: `cd frontend && npm run build && npm test`
Expected: build PASS; all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SettingsPage.tsx frontend/src/components/TricksPage.tsx
git commit -m "feat: restyle SettingsPage and TricksPage for Sharp/Techy theme"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend lint, test, build**

Run: `cd frontend && npm run lint && npm test && npm run build`
Expected: lint PASS (no errors), all tests PASS, build PASS.

- [ ] **Step 2: Backend tests**

Run from repo root: `uv run pytest`
Expected: all tests PASS (no backend changes were made).

- [ ] **Step 3: Manual visual pass**

Run the full app: `cd frontend && npm run build`, then from repo root
`uv run mathtrainer`, open `http://localhost:8000`. Check every screen against
`docs/superpowers/specs/2026-05-22-sharp-techy-redesign-design.md` §Per-Screen:
- Dashboard — stat tiles, sparkline, today bar, heatmap, nav buttons
- Practice — counter, mono problem, accent input, Enter-to-submit
- Summary — stat cards, per-question review list
- Progress — four dark-themed charts
- Settings — dark form fields, accent focus
- Tricks — dark trick cards by category
Confirm: dark theme everywhere, Space Mono on all numerals, visible accent
focus rings when tabbing, no leftover light/unstyled elements.

- [ ] **Step 4: Commit any fixes**

If Step 3 surfaced issues, fix them and commit:
```bash
git add -A
git commit -m "fix: address redesign verification findings"
```
If nothing needed fixing, skip this step.

---

## Self-Review Notes

- **Spec coverage:** Visual system (Task 1 tokens), framework (Task 1 Tailwind),
  all 7 screens (Tasks 3–7), auto-submit fix (Task 4), answer review (Task 5),
  accessibility — focus rings (Task 1 `:focus-visible` + `ui/` components),
  `aria-live` (Task 4) — all covered. Out-of-scope items correctly excluded.
- **Type consistency:** `SessionStats` fields (`accuracy`, `correct`,
  `answered`, `avgMsToSubmit`) match `lib/session.ts`. `SessionSummary` fields
  (`rating_after`, `rating_before`, `total_score`, `session_id`,
  `weak_operations`) match `lib/api.ts`. `Progress`, `Settings`, `TrickStat`,
  `Dashboard`, `HeatmapCell` usages match `lib/types.ts`.
- **No placeholders:** every code step contains full file contents or an exact
  find-and-replace.
