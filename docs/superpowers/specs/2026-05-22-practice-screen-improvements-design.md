# Design: Practice-Screen Improvements

**Date:** 2026-05-22
**Status:** Approved

## Goal

Three usability changes to the practice (drill) screen:

1. **Instant correct-answer recognition** — a correct answer is accepted as
   soon as it is typed, without pressing Enter.
2. **"I don't know" skip** — a way to give up on a question.
3. **Pause + trick explanation on a miss** — when an answer is wrong or
   skipped, the screen stops and shows the full trick explanation instead of
   auto-advancing.

All three are confined to the practice screen. There are **no backend, API,
database, or scoring-model changes**: a skip is recorded as an ordinary
incorrect attempt, which the existing API already accepts.

## Out of Scope

- Mid-question pausing / "take a break" (the explanation is only meaningful
  *after* an answer).
- Any change to how tricks are authored or stored.
- New persisted fields (no `skipped` column — a skip is just an incorrect
  attempt with no given answer).

## Feature 1: Instant correct-answer recognition

In `PracticeScreen`, the input's `onChange` handler, after sanitising the
typed digits, checks whether the typed value equals `question.answer`. If it
does (and the question has not already been submitted), it submits immediately
as correct.

- A wrong or partial entry never triggers auto-submit — so a mistyped digit is
  never locked in (this preserves the fix from the earlier redesign).
- Enter still works, and is now only needed to deliberately commit a *wrong*
  answer.
- Guard: only auto-submit when the sanitised input is non-empty (`Number('')`
  is `0`, which must not match an answer of `0` on an empty field).
- The `submittedRef` guard prevents any double-submit if Enter and the
  matching keystroke race.

## Feature 2: "I don't know" skip

- A quiet **"I don't know"** button renders under the input while the user is
  answering (i.e. while `feedback === null`). It is hidden once an answer is
  submitted.
- The **Esc** key is also bound to skip, handled in the input's `onKeyDown`.
- Skipping submits the current question as a result with `isCorrect = false`
  and `givenAnswer = null`. Timing (`msToFirstKey`, `msToSubmit`) is captured
  as for any attempt; `msToFirstKey` is `null` if the user typed nothing.
- A skip is a "miss" and therefore triggers the pause + explanation (Feature 3).
- `QuestionResult.givenAnswer` is already typed `number | null`; `null`
  uniquely denotes a skip. No type or backend change is required.

## Feature 3: Pause + trick explanation on a miss

Replaces the current fixed-delay auto-advance.

- **Correct answer** → unchanged: a brief ~350 ms `✓ correct` flash, then
  auto-advance.
- **Wrong answer or skip** → the screen **stops**. No auto-advance timer is
  set. It shows:
  - the correct answer (`✗ answer N`; for a skip, `✗ skipped — answer N`),
  - if `question.features.trickSlug` is set, the trick's full explanation
    (name + `lesson`) via the new `TrickExplanation` component,
  - a **"Next →"** button, auto-focused so that Space/Enter advances it.
  The user advances only by activating that button. If the question has no
  trick, the answer and the Next button still show (no trick panel).
- The on-screen **timer freezes** when an answer is submitted: the live-timer
  interval stops updating `elapsed` once `submittedRef.current` is true, so it
  does not keep counting while the user reads.

## Components and Files

**New:**
- `frontend/src/components/TrickExplanation.tsx` — presentational component.
  Props: `trick: Trick`. Renders the trick `name` and full `lesson`
  (`whitespace-pre-line`) inside a `Card` styled to the Sharp/Techy theme.

**Modified:**
- `frontend/src/components/PracticeScreen.tsx` — Features 1–3:
  - `onChange` auto-submits on exact match.
  - A skip path (button + Esc) submitting `givenAnswer = null`,
    `isCorrect = false`.
  - `submit` accepts the skip case; on a miss it shows the paused state
    instead of scheduling auto-advance; on correct it keeps the 350 ms timer.
  - A `Next →` button shown only in the paused (miss) state.
  - The live-timer effect stops updating once submitted.
- `frontend/src/components/SummaryScreen.tsx` — the per-question review row
  shows `skipped` (instead of `you: —`) when `givenAnswer === null`.

**Unchanged:** backend (`src/`), API, database/schema, scoring model
(`model.py`), `lib/tricks.ts`, `lib/types.ts`, `lib/session.ts`, `lib/api.ts`.

## Data Flow

A practice attempt produces a `QuestionResult` exactly as today. The only new
case is `givenAnswer: null` for a skip. `SummaryScreen` already forwards all
results to `finishSession`, which maps them to `AttemptPayload`
(`given_answer: number | null` — already supports `null`). The backend's
`process_attempt` receives `is_correct = false` for a skip and treats it like
any wrong answer. Nothing downstream needs to distinguish a skip from a wrong
answer.

## Error Handling

No new failure modes. Submission, session save, and error display are
unchanged. The paused state is purely client-side UI.

## Testing

- Existing frontend unit tests (`lib/*.test.ts`) and backend tests
  (`uv run pytest`) must stay green — no `lib/` or backend logic changes.
- `cd frontend && npm run build && npm run lint` must pass.
- Manual verification on the running app:
  - Typing the exact correct answer accepts it with no Enter; a wrong/partial
    entry does not auto-submit and remains correctable.
  - The "I don't know" button and the Esc key both skip; the skip is recorded
    as incorrect and appears as `skipped` in the summary review.
  - A wrong answer and a skip both stop on the explanation with a working
    `Next →` button (Space/Enter and click); a correct answer still
    auto-advances; the timer freezes on answer.
