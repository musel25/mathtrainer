# Useful tricks + per-trick mastery dashboard — design

**Date:** 2026-05-22
**Status:** Approved
**Branch:** `worktree-feat+useful-tricks-and-mastery` (worktree off `main`)

## Problem

mathtrainer ships 47 mental-math tricks, but the catalog is skewed: ~80% are
**pattern shortcuts** that fire only on special inputs (`×11`, `×101`,
`near-100`, `repdigit`). The high-leverage **general methods** — the ones that
apply to almost any problem of a given type — are mostly absent. There is no
general 2-digit × 2-digit multiplication, no place-value 2-digit × 1-digit, no
left-to-right addition, no general subtraction, and no any-percentage method.

Separately, per-trick performance is under-surfaced. `TricksPage` shows a flat
list with a bare `62% (8/13)` per trick — no sense of which tricks are weak,
which are undrilled, or where to focus. The global rating blends all six
operations into one number.

## Goals

1. Add 8 new tricks, led by the universal methods, with `×3/6/7` filling the
   gap beside the existing `×4/5/8/9`.
2. Rebuild `TricksPage` into a per-trick **mastery dashboard**: a "Needs work"
   section, color-coded proficiency bars, and per-category summaries.

Both parts are **frontend-only**. The backend treats trick slugs opaquely and
`/api/tricks` already returns everything the dashboard needs.

## Part A — New tricks

### Two kinds of trick

Existing tricks are **pattern shortcuts**: `detectTrick()` auto-detects them on
any matching question, and a detected trick grants a −6 difficulty relief
(`computeDifficulty`, `difficulty.ts`).

The new universal methods apply to *almost every* problem of their type. If
`detectTrick()` picked them up, nearly every multiply/add question would get the
−6 relief — deflating difficulty across the adaptive engine — and questions
would be falsely labeled "trick used."

**Decision:** add an optional `autoDetect` field to the `Trick` interface,
defaulting to `true`. General methods set `autoDetect: false`.

- `detectTrick()` considers only tricks where `autoDetect !== false`.
- General methods still appear in the catalog and in Learn mode (Learn calls
  `trick.generate` directly, independent of `detectTrick`).
- General-method per-trick stats therefore accrue from deliberate Learn-mode
  practice — the more honest signal for "have you drilled this method."

### The 8 new tricks

General methods (`autoDetect: false`):

| Slug | Category | Method |
|---|---|---|
| `mult-1digit-placevalue` | multiplication | 2-digit × 1-digit: split the 2-digit number into tens + units, multiply each, add (`47×6 → 240 + 42 = 282`) |
| `mult-2digit-crisscross` | multiplication | 2-digit × 2-digit cross-multiplication (`units×units`, cross sum, `tens×tens`) |
| `add-left-to-right` | addition-subtraction | Add tens, add units, combine (`58+37 → 80 + 15 = 95`) |
| `sub-count-up` | addition-subtraction | Subtract by counting up from the smaller number to the larger |
| `percent-building-blocks` | percentages | Build any % from 10% + 5% + 1% chunks (`37% of 200 → 30% (60) + 5% (10) + 2% (4) = 74`) |

Pattern shortcuts (`autoDetect: true`):

| Slug | Category | Method |
|---|---|---|
| `times-3` | multiplication | double, then add the number once |
| `times-6` | multiplication | ×3, then double |
| `times-7` | multiplication | ×5, then add double the number |

### Trick definitions

Each trick provides `slug`, `name`, `category`, `lesson`, `tip`, `applies`,
`generate` (existing `Trick` shape), plus `autoDetect` for general methods.

- `applies` stays coherent for every trick even when `autoDetect: false` (used
  by tests and any future use), but is not consulted by `detectTrick` for
  general methods.
- `generate` ranges:
  - `mult-1digit-placevalue`: 2-digit `a ∈ [12,99]` × 1-digit `b ∈ [3,9]`.
  - `mult-2digit-crisscross`: `a, b ∈ [11,99]`.
  - `add-left-to-right`: `a, b ∈ [11,99]`.
  - `sub-count-up`: `a ∈ [30,99]`, `b ∈ [11, a−1]`.
  - `percent-building-blocks`: `pct` drawn from non-"nice" values
    (`[12,15,35,37,45,55,65,85]`), `base` a multiple of 100 so the answer is an
    integer.
  - `times-3/6/7`: `a ∈ [11,99]`, paired with `3` / `6` / `7`.
- `times-3/6/7` `applies`: `operation === 'multiply' && operands.includes(n)`,
  matching the existing `×4/5/8/9` pattern. They are operand-specific, so they
  do not conflict with each other or with other tricks in detection order.

### Catalog placement & display

- Tricks stay in their existing operation categories (no new "Core methods"
  category). `CATEGORY_META` is unchanged.
- Within a category, the general method is listed **first**, then the pattern
  shortcuts — the foundational method leads.
- General methods render a small **"core method"** badge in the catalog so the
  methods-vs-shortcuts distinction is visible.

### Difficulty note

The `×3/6/7` questions previously had no detected trick; now they receive the
standard −6 relief, exactly like `×4/5/8/9`. This is a small, intentional
recalibration that makes the multiplication-by-small-number tricks consistent.
General methods cause no deflation (they are not auto-detected).

## Part B — Per-trick mastery dashboard

`/api/tricks` already returns `slug / attempts / correct / proficiency /
last_practiced` per trick — **no backend change needed.** `TricksPage` is
rebuilt as a mastery view.

### Mastery helper — `frontend/src/lib/trickMastery.ts` (new)

Pure, unit-tested module:

- `type MasteryLevel = 'unpracticed' | 'weak' | 'ok' | 'strong'`
- `masteryLevel(stat: TrickStat | undefined): MasteryLevel`
  - `unpracticed` — no stat, or `attempts === 0`
  - `weak` — `proficiency < 0.6`
  - `ok` — `0.6 ≤ proficiency < 0.85`
  - `strong` — `proficiency ≥ 0.85`
- `needsWork(stats: Record<string, TrickStat>): string[]` — slugs of tricks at
  `weak` level, sorted by proficiency ascending then attempts descending,
  capped at 5.
- `categorySummary(slugs, stats): { practised: number; total: number;
  avgProficiency: number }` — `avgProficiency` over practised tricks only;
  `0` when none practised.

### `TricksPage` rebuild

- **"Needs work" section** at the top — the `needsWork` tricks, each as a card
  linking straight to Learn mode (`onLearn`). Hidden when the list is empty.
- **Proficiency bar per trick** — reuse `ui/ProgressBar`, color-coded by
  `masteryLevel`: muted (unpracticed), error/red (weak), amber (ok),
  success/green (strong). The existing `62% (8/13)` text is kept beside it.
- **Per-category summary** in each category header — e.g.
  `7/15 practised · avg 71%` from `categorySummary`.
- **"core method" badge** on general-method cards (Part A).
- Loading and error states are preserved.

The Progress page is left unchanged — it already carries per-operation ratings;
`TricksPage` becomes the dedicated per-trick hub.

## Files touched (all frontend)

- `frontend/src/lib/tricks.ts` — `autoDetect` field on `Trick`; `detectTrick`
  filters on it; 8 new tricks; general methods ordered first in their category.
- `frontend/src/lib/tricks.test.ts` — tests for the new tricks and `detectTrick`.
- `frontend/src/lib/trickMastery.ts` — new pure helper module.
- `frontend/src/lib/trickMastery.test.ts` — new tests.
- `frontend/src/components/TricksPage.tsx` — mastery dashboard rebuild.

No Python, no schema, no API, no `questionGenerator` changes.

## Testing (TDD)

- `tricks.test.ts`:
  - For each of the 8 new tricks: `generate(rng)` produces a `Question` whose
    `answer` is arithmetically correct and which satisfies its own `applies`.
  - `detectTrick` returns `null` / skips `autoDetect: false` tricks for inputs
    that only a general method would match.
  - `detectTrick` still resolves `×3/6/7` to the new shortcut slugs.
- `trickMastery.test.ts`:
  - `masteryLevel` at the `0.6` and `0.85` boundaries and for the
    `unpracticed` case.
  - `needsWork` ordering (proficiency asc, attempts desc) and the cap of 5.
  - `categorySummary` with zero, partial, and full practice.

## Non-goals

- Random practice drills still cap the multiply generator at `b ≤ 19`, so full
  2-digit × 2-digit problems appear in **Learn mode**, not random sessions.
  Widening the generator touches the adaptive engine and is out of scope.
- No per-trick trend-over-time chart — `attempts.trick_slug` could support it
  later, but v1 shows a current-proficiency snapshot only.
- No changes to the Progress or Dashboard pages.
- No new "Core methods" catalog category.
