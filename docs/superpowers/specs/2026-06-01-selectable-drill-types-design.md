# Selectable drill types — design

**Date:** 2026-06-01
**Status:** Approved

## Goal

Let the user choose which of the six arithmetic operations appear in their
daily/practice drills, configured from the Settings page. The default excludes
`square` (squaring) and `percent` (percentages), so a fresh install drills
`add`, `subtract`, `multiply`, `divide`.

## Decisions

- **Scope:** Daily/practice drills only. The Tricks dashboard and explicit
  "Learn this trick" mode are unaffected — the user can still study squaring and
  percentage tricks deliberately.
- **Empty guard:** At least one operation must stay enabled. The Settings UI
  blocks unchecking the last enabled operation; the backend rejects an empty or
  unknown-slug list with HTTP 422.

## Data model (backend)

`settings` table gains one column:

```sql
enabled_operations TEXT NOT NULL DEFAULT '["add","subtract","multiply","divide"]'
```

- `schema.sql` declares the column with that default (applies to fresh DBs).
- `db._migrate()` runs an idempotent `ALTER TABLE settings ADD COLUMN
  enabled_operations ...` so databases created by older versions pick up the
  default.
- `db.load_settings` / `db.save_settings` JSON-encode/decode the list.
  `_DEFAULT_SETTINGS` includes the default four.

## API

- `SettingsModel` gains `enabled_operations: list[str]`. A validator enforces a
  non-empty subset of `model.OPERATIONS` (the canonical six); violations →
  Pydantic 422.
- `GET/PUT /api/settings` round-trip the field through the existing handlers.
- `GET /api/session-plan` returns `enabled_operations` (read from settings) so
  the frontend can restrict generation without a second request.

## Question generation (frontend)

- `generateQuestion(band, rng, operationRatings, enabledOperations?)` and the
  internal `weightedPool` accept an `enabledOperations: Operation[]` list,
  defaulting to all six. The weighted pool is built only from enabled
  operations.
- `App.handleStart` passes `plan.enabledOperations` through.

## Settings UI

`SettingsPage` gains a "Drill types" section: six checkboxes (Addition,
Subtraction, Multiplication, Division, Squaring, Percentages). The last remaining
checked box is disabled to enforce the empty guard. Saves through the existing
optimistic `putSettings` flow.

## Out of scope

Tricks dashboard, Learn mode, and per-operation Elo ratings are untouched. A
disabled operation simply stops accruing new attempts; its stored rating is
preserved and resumes when re-enabled.

## Testing

- `questionGenerator.test.ts`: with a restricted `enabledOperations`, generated
  questions only use those operations; full set still reaches all six.
- `test_db.py`: settings round-trip includes `enabled_operations`; migration adds
  the column to an old DB.
- `test_api.py`: `GET/PUT /api/settings` round-trip the field; empty / unknown
  lists are rejected; `session-plan` exposes the field.
