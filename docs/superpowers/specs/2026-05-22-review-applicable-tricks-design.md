# Design: Applicable Tricks in the Session Review

**Date:** 2026-05-22
**Status:** Approved

## Goal

In the post-session review (`SummaryScreen`), show — for **every** question —
the mental-math trick(s) that apply to it, and let each row expand to the
trick's full explanation. This turns the review into a learning surface: "here
is the shortcut you could have used on each question."

Frontend-only. No backend, API, database, or scoring-model changes.

## Out of Scope

- Changing how questions are generated or tagged.
- A session-level trick rollup (the feature is strictly per question row).
- Any change to the practice screen's behavior (only a small refactor of the
  shared `TrickExplanation` component touches it).

## Feature 1: `applicableTricks` helper

Add a pure function to `frontend/src/lib/tricks.ts`:

```ts
export function applicableTricks(
  q: Pick<Question, 'operation' | 'operands'>,
): Trick[] {
  return TRICKS.filter((t) => t.applies(q))
}
```

It returns every `Trick` whose `applies()` predicate matches the question —
*all* shortcuts that would have worked, not just the single `trickSlug` the
generator tagged. Covered by a unit test in `frontend/src/lib/tricks.test.ts`.

## Feature 2: `ReviewRow` component

New component `frontend/src/components/ReviewRow.tsx`. Renders one row of the
session review. Props: `result: QuestionResult`.

- Computes `applicableTricks(result.question)` once.
- Renders the row as a `<button>`:
  - Existing content preserved: ✓/✗ mark, `prompt = answer`, the
    `you: N` / `skipped` text for a miss, and the time.
  - If tricks apply, their names render inline (`💡 Multiply by 11`, joined by
    `, ` when several), and a chevron (`▸` collapsed / `▾` expanded) shows.
  - The button is `disabled` when no tricks apply (not clickable, not
    focusable), and carries `aria-expanded` when it does.
- Clicking the row toggles a local `open` state (`useState(false)`).
- When `open`, an inset panel renders below the row: a `bg-bg` block
  (recessed — darker than the review `Card`'s `bg-surface`, so it reads as
  inset rather than a nested card) containing a `TrickExplanation` for each
  applicable trick.

## Feature 3: `TrickExplanation` refactor

`TrickExplanation` currently renders the trick name + lesson **inside a `Card`**
with practice-screen-specific layout classes. Refactor it to a **content-only**
block so it is the single source of truth for rendering a trick, reusable in
both the practice pause panel and the review inset:

```tsx
interface Props {
  trick: Trick
  className?: string
}

export function TrickExplanation({ trick, className = '' }: Props) {
  return (
    <div className={`text-left ${className}`.trim()}>
      <div className="mb-1 font-mono text-sm text-streak">💡 {trick.name}</div>
      <p className="whitespace-pre-line text-sm text-muted">{trick.lesson}</p>
    </div>
  )
}
```

Callers supply the container:
- **PracticeScreen** wraps it in its `Card`:
  `<Card className="mt-4 w-full max-w-[420px] p-4"><TrickExplanation trick={trick} /></Card>`.
- **ReviewRow** renders it inside the `bg-bg` inset, spacing multiple via
  `className`.

## Feature 4: `SummaryScreen` wiring

In `frontend/src/components/SummaryScreen.tsx`, the review `Card` currently maps
each result to an inline `<div>` row. Replace that inline row markup with
`<ReviewRow result={r} key={i} />`. The `Card` keeps `divide-y divide-border`
so rows stay separated. Nothing else on the summary screen changes.

## Files

**New:**
- `frontend/src/components/ReviewRow.tsx`

**Modified:**
- `frontend/src/lib/tricks.ts` — add `applicableTricks()`
- `frontend/src/lib/tricks.test.ts` — add a test for `applicableTricks()`
- `frontend/src/components/TrickExplanation.tsx` — content-only + `className`
- `frontend/src/components/PracticeScreen.tsx` — wrap `TrickExplanation` in a
  `Card` at its single usage site
- `frontend/src/components/SummaryScreen.tsx` — use `<ReviewRow>`

**Unchanged:** all backend, the API, the database, the scoring model, and
`lib/types.ts` / `lib/session.ts` / `lib/api.ts`.

## Error Handling

No new failure modes. `applicableTricks` is a pure filter; an empty result is
the normal "no shortcut" case. The expand/collapse is local UI state.

## Testing

- New unit test for `applicableTricks` in `tricks.test.ts`: a question crafted
  to match a known trick returns that trick; every returned trick satisfies
  `applies()`.
- Existing frontend unit tests and backend tests must stay green.
- `cd frontend && npm run build && npm run lint` must pass.
- Manual check: the review shows trick names on matching rows, rows expand to
  the lesson, no-trick rows are inert, and the practice screen's miss panel
  still renders the trick explanation correctly after the refactor.
