# mathtrainer — Design Spec

- **Date:** 2026-05-21
- **Status:** Approved design, pending spec review
- **Topic:** Local, single-user mental-math trainer with an adaptive personal difficulty model

---

## 1. Purpose & Goals

mathtrainer is a local web app for one user (the author) to practice mental
arithmetic, modeled on [mathtrainer.ai](https://mathtrainer.ai/). It drills
timed arithmetic questions, learns the user's personal speed baseline, adapts
difficulty to the edge of their ability, teaches mental-math shortcuts and
weaves them into practice, and tracks progress and the daily habit.

No accounts, no cloud, no login. One user, one machine, one local SQLite file.

### Success criteria

- A practice session feels instant — no perceptible lag between answering a
  question and the next one appearing.
- Difficulty adapts: as the user gets faster, questions get harder.
- The user can see, in graphs, whether they are improving over weeks.
- The app teaches a library of mental-math tricks and deliberately puts
  trick-applicable questions into practice.
- A daily streak and calendar heatmap make the habit visible.
- Every attempt is stored in a queryable SQLite file the user can analyze
  with pandas.

### Non-goals

- No multi-user, authentication, or cloud sync.
- No math beyond mental arithmetic (addition, subtraction, multiplication,
  division, squaring, percentage). No algebra.
- No mobile-native app — a browser on the same machine is the only target.

---

## 2. Architecture

A single **FastAPI** process serves both the JSON API (`/api/*`) and the built
**React** SPA (everything else). The user launches it with one command
(`uv run mathtrainer`), which starts uvicorn and opens `localhost:8000`. All
data lives in one local `.sqlite` file.

### The hot path / slow path split

This split is what makes the drill feel instant.

- **Frontend owns the hot path** — question generation, the difficulty formula,
  the timed loop, local scoring, and instant feedback. This all runs in the
  browser. **Zero network calls occur mid-drill.**
- **Backend owns the slow path** — persistence, the personal model, the skill
  rating, weak-spot analysis, progress aggregation, and the trick state. It is
  never in the path of answering a question.

### Session flow

1. User starts a session. Frontend requests **one session plan** from the
   backend: current skill rating, the personal baseline curve, weak-spot flags,
   learned tricks, and the target difficulty band.
2. Frontend runs the entire drill locally — generates each question, times it,
   scores it, shows feedback — and buffers every attempt in memory.
3. At session end (and optionally in periodic background flushes for long
   sessions), the frontend POSTs the batch of attempts.
4. Backend persists the attempts, recomputes the personal model and rating in
   attempt order, and returns the updated state for the summary screen.

### No duplicated logic

The **difficulty formula and question generator live only in TypeScript**. The
difficulty score is computed per question on the client and sent with each
attempt. The backend consumes that number and never regenerates a question.
The personal model (Python) is the only consumer of difficulty on the backend.

### Process & concurrency

Single user, single process, one SQLite writer, strictly sequential sessions.
No concurrency concerns. SQLite in WAL mode is sufficient.

---

## 3. Question generation

Questions are generated client-side. Operations: addition, subtraction,
multiplication, division, squaring, percentage.

### Constraints

- **All answers are integers and non-negative.** Division is generated
  answer-first (`a × b → present a·b ÷ b`) so it always divides evenly.
  Subtraction is generated with minuend ≥ subtrahend. Percentages are
  restricted to combinations with integer results.
- Operand magnitudes (digit counts) are drawn to land the question's difficulty
  inside the session's **target difficulty band**.
- **Anti-repetition:** no exact question repeats within a session; trivially
  easy questions (e.g. `× 1`, `× 0`) are excluded.

### Difficulty score

Each generated question gets a scalar difficulty in roughly **1–100** from a
hand-designed feature formula over:

- operation base weight (add < sub < mul < div; plus square, percent)
- operand digit counts (log-scaled)
- count of carries / borrows required
- a small downward adjustment when a clean shortcut (trick) applies

v1 is hand-tuned. It is a pure function — trivially unit-tested and refinable.
See §10 for the planned data-driven refit (Phase 5, out of v1 scope).

---

## 4. Timing & input model

The quality of the time measurement matters because it feeds the whole metric.

- The per-question timer starts when the question finishes rendering.
- The frontend records **two timestamps**: time-to-first-keystroke (a proxy for
  thinking time) and time-to-submit. **time-to-submit is the primary metric**;
  both are stored so typing overhead can be analyzed later.
- **Input model:** the answer auto-submits as soon as the typed value reaches
  the answer's expected digit length, or on Enter. This keeps the loop fast and
  fully keyboard-driven.
- **Wrong answers:** no retry. The correct answer is shown briefly, then the
  drill advances. The attempt is marked incorrect. This keeps timing data clean.
- The practice screen is keyboard-first: numeric input is auto-focused; Enter
  submits; Esc ends the session.

---

## 5. Personal model — "measure against yourself"

The backend maintains, in `model_state`:

### Baseline curve

Difficulty is bucketed into ~10 bins. Each bin holds an EWMA of the user's
**correct** solve-times and an EWMA of squared deviation — yielding an expected
solve-time and a spread per difficulty level. During **cold start** (too few
samples in a bin), a default curve is used and confidence is low; bins graduate
to learned values once enough samples accumulate.

### Per-question result

For a correct answer at difficulty `d` with solve-time `t`:

```
z = (expected(d) - t) / spread(d)
```

`z > 0` means the user beat their own baseline.

### Score

```
score = difficulty × correctness × speed_factor(z)
```

`speed_factor` is a bounded function of `z` (rewards beating the baseline,
saturates so a single fluke can't dominate). Wrong answers score zero and are
tracked separately — they do **not** enter the time baseline.

### Skill rating (Elo-style)

The user holds a rating `R`. Each question has a difficulty rating. Expected
success `p = logistic(k · (R − d))`. Outcome is success when the answer is
correct **and** at or under baseline time. `R ← R + K · (outcome − p)`.

The question selector targets difficulty just above `R` — the edge of ability,
where learning is fastest (desirable difficulty).

### Weak-spot detection

Per-operation and per-trick residuals (`actual − predicted` solve-time) are
tracked. Operations or tricks with a persistently positive residual (the user
is reliably slower than their own curve predicts) are flagged: the session
planner over-samples them and surfaces the relevant trick.

---

## 6. Tricks

A **static library** in code/JSON. Each trick is:

```
{ slug, name, applicability_predicate, mini_lesson, example_generator }
```

Example tricks: ×11 shortcut, squaring numbers ending in 5, ×5 as ×10÷2,
near-100 multiplication, percentage swap (`x% of y = y% of x`),
doubling/halving, ×9 trick, subtract-by-adding-up.

### Learn mode

Pick a recommended trick → read the mini-lesson with worked examples → a focused
drill of trick-applicable questions. Trick proficiency is tracked from
performance on those questions.

### Woven into practice

The session planner reserves a quota of questions where a **learned** trick (or
a trick tied to a current weak spot) applies. A slow answer on such a question
surfaces the trick hint in the post-question feedback.

---

## 7. Habit tracking

Self-contained in this app, intentionally **decoupled** from the user's separate
`habit-tracker` project.

- **Daily goal:** configurable — N questions or M minutes per day.
- **Streak:** consecutive days the goal was met.
- **Calendar heatmap:** one cell per day, colored by that day's total score.
- All of the above surface on the Dashboard.

Daily aggregates are derived by query from `attempts` / `sessions`, not stored
as a separate table.

---

## 8. Pages & session modes

### Pages

| Page | Contents |
|------|----------|
| **Dashboard** | Streak, today's goal progress, "Start daily drill" CTA, rating sparkline, recent accuracy, calendar heatmap |
| **Practice** | One large question, numeric input, live timer, in-session progress bar, instant correct/wrong feedback, trick hint when relevant |
| **Session summary** | Accuracy, average speed-vs-baseline (`z`), total score, rating delta, weak spots flagged, tricks touched |
| **Progress** | Charts: rating over time, average solve-time per operation over time, accuracy trend, score trend; per-operation and per-trick breakdown |
| **Tricks** | The trick library; Learn flow; per-trick proficiency badges |
| **Settings** | Daily goal, default session length, enabled operations |

Progress charts are computed from **raw `attempts` rows**, never from the
rolling `model_state`, so any historical comparison is always reconstructable.

### Session modes

- **Daily drill** — adaptive mixed practice; the default; counts toward streak.
- **Focus** — a single operation or a single trick.
- **Sprint** — fixed time (e.g. 2 minutes), maximize score.
- **Learn** — a trick mini-lesson followed by a focused drill.

---

## 9. Data model (SQLite)

| Table | Key columns |
|-------|-------------|
| `attempts` | id, session_id, ts, operation, operands (json), correct_answer, given_answer, is_correct, difficulty, features (json), ms_to_first_key, ms_to_submit, trick_slug (nullable), score |
| `sessions` | id, mode, started_at, ended_at, n_questions, total_score, rating_before, rating_after |
| `model_state` | single row: rating, baseline_bins (json: per-bin mean/spread/count), operation_residuals (json), updated_at |
| `trick_state` | slug, learned_at, proficiency, last_practiced |
| `settings` | single row: daily_goal_type, daily_goal_value, default_session_length, enabled_operations (json) |

SQLite runs in WAL mode. A `GET /api/export.csv` endpoint streams the joined
`attempts` view as CSV for offline analysis.

---

## 10. Build phases

v1 is Phases 1–4. Phase 5 is explicitly out of v1 scope. The implementation
plan (produced by the writing-plans skill) sequences the work.

1. **Practice loop** — project scaffold, question generation, difficulty
   formula, the timed client-side loop, basic attempt persistence. The user can
   drill and attempts are saved.
2. **Adaptive engine** — personal baseline model, skill rating, adaptive
   question selection, the session-plan endpoint, the session summary.
3. **Progress & habit** — progress graphs, daily goal, streak, calendar
   heatmap, the Dashboard.
4. **Tricks** — the trick library, Learn mode, trick weaving into practice,
   per-trick proficiency and weak-spot integration.
5. **(Out of v1 scope) Data-driven difficulty** — refit the difficulty formula
   against the user's real solve-times (a regression / item-response model).
   The `attempts` table already stores every feature and timing needed for
   this; no schema change required.

---

## 11. Testing

- **Python (pytest, via uv):** difficulty consumption, baseline EWMA updates,
  rating updates, weak-spot detection, all API endpoints.
- **Frontend (Vitest):** the question generator (integer-answer invariant,
  difficulty banding, anti-repetition), the difficulty formula, and local
  scoring — all pure functions.
- The difficulty formula and personal model are pure functions by design,
  which keeps them highly testable.

---

## 12. Stack

- **Backend:** Python — FastAPI, uvicorn, pydantic, stdlib `sqlite3`. Managed
  with `uv`. Exposed as a `mathtrainer` console-script entry point.
- **Frontend:** React, Vite, TypeScript, Recharts (line/bar charts); the
  calendar heatmap is a hand-built CSS grid.
- **Repository:** a public GitHub repo named `mathtrainer`, created via the
  GitHub MCP as the first implementation step, living in `~/Github/mathtrainer`.
