# Per-operation ability tracking — design

**Date:** 2026-05-21
**Status:** Approved
**Branch:** `feat/operation-ratings`

## Problem

mathtrainer tracks a single global skill `rating` (1–100, Elo-style). It has no
graded, per-operation skill score — only a per-operation residual that produces
a binary "weak operation" flag and an average-solve-time display. A user cannot
see *how good they are at addition vs. division vs. multiplication*.

## Goal

Give each of the six operations (`add`, `subtract`, `multiply`, `divide`,
`square`, `percent`) its own 1–100 Elo-style rating, mirroring the existing
global rating. Surface these ratings on the Progress page, and use them to bias
question generation toward weaker operations.

## Decisions

| Question | Decision |
|---|---|
| Metric | Per-operation rating (1–100), same Elo logic as the global rating |
| Use | Display on Progress page **and** adaptive targeting of question generation |
| Scope | All 6 operations |
| Storage | Replace the existing `residuals` structure — one per-operation system, not two |
| Existing users | Backfill ratings by replaying attempt history, not cold-start at 50 |

## Approach: Replace

The per-operation rating becomes the single per-operation skill signal. The
existing `residuals` map (used only to compute the binary `weak_operations`
flag) is superseded: the `model_state.residuals` column is renamed to
`operations`, and `weak_operations()` is redefined to derive from ratings. This
avoids two competing notions of per-operation skill.

## Design

### 1. Model state (`src/mathtrainer/model.py`)

- Rename the state key `residuals` → `operations`. Shape:
  `{op: {"rating": float, "count": int}}` for all 6 operations.
- `default_model_state()` seeds each operation at `DEFAULT_RATING` (50.0) with
  `count` 0.
- New pure function `_update_op_rating(state, operation, difficulty, is_correct,
  solve_ms)` — mirrors the existing global `_update_rating` Elo step:
  - `p = logistic((op_rating - difficulty) / RATING_SCALE)`
  - `success = 1.0 if (is_correct and solve_ms <= expected_time(...)) else 0.0`
  - `new_rating = clamp(op_rating + RATING_K * (success - p), 1.0, 100.0)`
  - Increments that operation's `count`.
  - `expected_time` stays global (per difficulty bin) — reused as-is.
- `process_attempt()` calls `_update_op_rating` on every attempt (correct or
  not), alongside the existing global rating update.
- New accessor `operation_ratings(state) -> dict[str, float]`.
- `weak_operations(state)` redefined: returns operations whose rating sits a
  margin (`WEAK_RATING_MARGIN`, ~8 points) below the global rating. Keeps the
  Summary screen working, now derived from ratings.
- Remove the now-unused residual constants (`WEAK_RESIDUAL_MS`,
  `_update_residual`) and the residual EWMA logic.

### 2. Persistence (`src/mathtrainer/db.py`, `src/mathtrainer/schema.sql`)

- `schema.sql`: the `model_state` per-operation column is named `operations`
  (was `residuals`) for fresh databases.
- `_migrate()`: idempotent migration —
  `ALTER TABLE model_state RENAME COLUMN residuals TO operations`, guarded on
  the old column still being present.
- `load_model_state` / `save_model_state` updated to read/write the
  `operations` column. Load normalizes legacy JSON: any entry missing a
  `rating` key gets `DEFAULT_RATING`.
- **One-time backfill** (runs exactly once, gated on the column rename just
  having happened): replay every row of `attempts`, ordered by `ts`, through
  `_update_op_rating` starting from `default_model_state()`, then persist the
  resulting per-operation ratings. Existing users see real ratings immediately.
  - Requires loading `operation`, `difficulty`, `is_correct`, `ms_to_submit`,
    `ts` for all attempts (extend the existing attempts query or add a new one).
- Fresh databases have no attempts and skip the backfill naturally.

### 3. API (`src/mathtrainer/app.py`, `src/mathtrainer/models.py`)

- `SessionPlan` model: replace `weak_operations: list[str]` with
  `operation_ratings: dict[str, float]` (all 6 operations).
- `/api/session-plan`: returns `operation_ratings` instead of `weak_operations`.
- `/api/progress`: add `operation_ratings` to the response.
- `SessionSummary` model: keeps `weak_operations` (now rating-derived) — the
  Summary screen is unchanged.

### 4. Frontend

- `frontend/src/lib/types.ts`:
  - `SessionPlan`: `weakOperations: Operation[]` → `operationRatings:
    Record<Operation, number>`.
  - `Progress`: add `operationRatings: Record<Operation, number>`.
- `frontend/src/lib/api.ts`: `getSessionPlan` and `getProgress` map the new
  `operation_ratings` field.
- `frontend/src/lib/questionGenerator.ts`: `generateQuestion`'s third argument
  becomes `operationRatings: Record<Operation, number>`. Build a weighted
  operation pool — `weight(op) = max(1, round((105 - rating) / 10))` — so a
  weak op (rating ~30) is sampled ~3–4× as often as a strong op (rating ~95),
  and every operation still appears. This replaces the current "enter weak ops
  twice" pool trick.
- `frontend/src/App.tsx`: thread `plan.operationRatings` into the
  `generateQuestion` call inside `handleStart`. Learn mode is unaffected (it
  calls `trick.generate` directly).
- `frontend/src/components/ProgressPage.tsx`: new **"Ability by operation"**
  section — a horizontal recharts `BarChart`, one bar per operation, value =
  rating, value axis domain `[0, 100]`. `recharts` is already imported.

### 5. Testing

- `model.py` (pytest, TDD):
  - `_update_op_rating`: rating rises on a fast correct answer, falls on a wrong
    answer, stays clamped to `[1, 100]`.
  - `process_attempt` updates the correct operation's rating and leaves others
    untouched.
  - `weak_operations` returns operations whose rating is below the margin.
  - Backfill replay produces deterministic ratings from a fixed attempt list.
- `questionGenerator.test.ts` (vitest, injected RNG): a weighted pool
  over-samples low-rated operations; every operation remains reachable.

## Non-goals

- No per-operation breakdown on the Dashboard (Progress page only).
- No per-operation difficulty bands — the global `target_band` still drives
  difficulty; only operation *selection* is biased.
- No historical per-operation rating time-series — only the current rating.
