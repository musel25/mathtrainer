# Design: mathtrainer "Sharp / Techy" Redesign

**Date:** 2026-05-22
**Status:** Approved

## Goal

mathtrainer works but is visually unstyled — every component uses inline
`style={{}}` props, there is no CSS file, no design tokens, no theme. This
project replaces that with a single, cohesive **"Sharp / Techy"** visual
system: dark, high-contrast, monospace-numeral, data-forward — a precision
instrument for mental-math drilling.

Because every component is rewritten during the restyle, three closely-coupled
UX fixes are folded in (see "Coupled Fixes").

## Out of Scope (follow-up phase)

These are deliberately deferred so the redesign ships clean:

- URL routing (replacing the hand-rolled `screen` state machine in `App.tsx`)
- New practice modes: custom practice, timed sprint, wrong-answer drill
- Sound / haptic feedback
- Data export/import
- Component-level test coverage

## Visual Design System

### Color tokens (dark, the only theme)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0D1117` | App background |
| `--surface` | `#161B22` | Cards, inputs, elevated panels |
| `--border` | `#21262D` | Hairline dividers |
| `--border-strong` | `#30363D` | Input borders, emphasized edges |
| `--text` | `#E6EDF3` | Primary text, numerals |
| `--text-muted` | `#7D8590` | Labels, secondary text |
| `--text-dim` | `#484F58` | Disabled, faint detail |
| `--accent` | `#2F81F7` | Focus, primary action, input cursor, links |
| `--success` | `#3FB950` | Correct answers, positive rating delta |
| `--error` | `#F85149` | Wrong answers, negative delta, save errors |
| `--streak` | `#D29922` | Streak flame, warnings |

Heatmap uses a 5-step green intensity scale (GitHub-style) keyed off `--success`.

### Typography

- **Space Mono** — every numeral, the math display, counters, timers, ratings,
  stat values, and all uppercase labels. Weight 400 normal, 700 for the math
  prompt and stat values.
- **Inter** — body text, prose, button labels, descriptions (Space Mono is hard
  to read in running text).
- Both fonts are **bundled into the repo** (`frontend/src/assets/fonts/`) and
  loaded via `@font-face` with `font-display: swap`. No runtime CDN dependency —
  the app is local-first.

### Other tokens

- **Radius:** `6px` everywhere (buttons, inputs, cards). Crisp, not pill.
- **Density:** compact. Hairline borders, grid feel.
- **Motion:** ~120ms ease transitions. Blinking `▮` cursor in the practice
  input. Accent glow ring (`box-shadow: 0 0 0 3px rgba(47,129,247,.18)`) on
  focused inputs. Brief feedback flash on correct/incorrect.

## Framework

**Tailwind CSS v4**, integrated via the `@tailwindcss/vite` plugin. Design
tokens above are declared once in a global stylesheet using Tailwind v4's
`@theme` block so they are usable both as CSS variables and Tailwind utility
classes.

**Not shadcn/ui.** The look is highly bespoke (custom practice screen, Space
Mono numerals throughout); shadcn's Radix primitives add dependency weight for
components barely used here, and its default aesthetic fights the custom theme.
Instead, hand-build a small set of presentational components.

### New dependencies

- `tailwindcss` (v4) + `@tailwindcss/vite` (devDependencies)

## Architecture

### New files

- `frontend/src/index.css` — `@import "tailwindcss"`, `@font-face` rules, the
  `@theme` token block, base element styles.
- `frontend/src/assets/fonts/` — bundled Space Mono + Inter woff2 files.
- `frontend/src/components/ui/` — hand-built presentational components:
  - `Button.tsx` — variants: `primary` (accent), `ghost` (bordered/quiet),
    `danger`. Visible accent focus ring.
  - `Card.tsx` — surface panel with hairline border.
  - `StatTile.tsx` — uppercase muted label + Space Mono value.
  - `ProgressBar.tsx` — thin track + accent fill.
  - `Screen.tsx` — shared page shell (max-width, centering, back affordance).

### Changed files

- `frontend/index.html` — set `<html>` dark; remove default styling reliance.
- `frontend/src/main.tsx` — import `index.css`.
- `frontend/vite.config.ts` — add `@tailwindcss/vite` plugin.
- All 7 components rewritten to use Tailwind classes + the `ui/` components
  instead of inline styles: `Dashboard`, `PracticeScreen`, `SummaryScreen`,
  `ProgressPage`, `SettingsPage`, `TricksPage`, `CalendarHeatmap`.

No backend changes. No changes to `lib/` logic except `PracticeScreen`'s
consuming component (see Coupled Fixes).

## Per-Screen Design

- **Dashboard** — mono `mathtrainer` wordmark; three `StatTile`s
  (STREAK / RATING / SESSIONS); rating sparkline (recharts, restyled — accent
  stroke, no chrome); thin "today" `ProgressBar` with mono `12/20`; primary
  `› start drill` button; `CalendarHeatmap` in the green scale; quiet bordered
  nav buttons for Progress / Tricks / Settings.
- **PracticeScreen** — the hero. `[03/10]` mono counter + hairline + `2.43s`
  timer; large Space Mono `47 + 38 =` prompt; input panel on `--surface` with
  accent border, glow ring, blinking cursor; feedback line
  `✓ correct` / `✗ answer 85`; trick-tip line below.
- **SummaryScreen** — mono stats (accuracy, avg time, score, rating delta with
  colored ▲/▼); **per-question review list** (see Coupled Fixes); `home` /
  `drill again` buttons.
- **ProgressPage** — recharts retheme to dark (accent/success strokes, muted
  mono axis labels, `--border` grid); per-operation ability chart restyled.
- **SettingsPage** — dark form controls, accent focus rings, mono numeric
  fields.
- **TricksPage** — dark list of tricks, mono worked examples.
- **CalendarHeatmap** — `--bg`/`--border` cells, 5-step green intensity scale.

## Coupled Fixes

### 1. Fix the auto-submit trap

`PracticeScreen.tsx` currently auto-submits the moment
`digits.length >= expectedLen`. If the user mistypes the first digit of a
multi-digit answer, the wrong answer is locked in with no chance to correct,
and the answer's digit count leaks the magnitude.

**Fix:** remove length-based auto-submit. Submit on **Enter** only. Keep the
input focused and the existing `firstKeyAt` / `msToSubmit` timing capture
unchanged. A short hint ("press Enter") appears under the input. This removes
`expectedLen` from submit logic entirely.

### 2. Answer review on SummaryScreen

`SummaryScreen` already receives the full `results: QuestionResult[]` array but
only shows aggregate stats. Add a **per-question review list**: one row per
question showing the prompt, the user's answer, the correct answer, and time
to submit — wrong rows marked with `--error`, correct with `--success`. This is
where learning happens.

### 3. Accessibility

- Visible accent focus ring on every interactive element (buttons, inputs,
  nav) — implemented in the `ui/` components and base styles.
- `aria-live="polite"` on the practice feedback region so the correct/incorrect
  result is announced.
- Accessible names on icon-only / glyph buttons.

## Testing

- Existing `frontend` unit tests (`lib/*.test.ts`) must continue to pass —
  the redesign does not touch `lib/` logic.
- Existing backend tests (`uv run pytest`) must continue to pass — no backend
  changes.
- The auto-submit fix changes `PracticeScreen` behavior; verify manually that
  Enter submits, that a mistyped digit is correctable with backspace, and that
  timing capture (`msToFirstKey`, `msToSubmit`) still records.
- `cd frontend && npm run build` must succeed (TypeScript + Vite).
- Manual visual pass of all 7 screens against this spec.

## Migration Notes

- `frontend/dist/` is gitignored and rebuilt — no action needed.
- After merge, the run instructions in `README.md` are unchanged
  (`npm install && npm run build`, then `uv run mathtrainer`).
