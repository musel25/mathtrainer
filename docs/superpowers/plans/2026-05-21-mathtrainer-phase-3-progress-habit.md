# mathtrainer Phase 3: Progress & Habit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make progress visible — a Dashboard with a daily-habit streak and a calendar heatmap, a Progress page with charts, and a Settings page, so the user can see whether they are improving and keep the habit.

**Architecture:** A pure Python `stats.py` aggregates finished sessions and attempts into daily totals, a streak, a heatmap series, and per-session progress series. A `settings` table holds the daily goal and session length. Two read endpoints (`/api/dashboard`, `/api/progress`) and a settings endpoint feed a restructured React app: a Dashboard landing page, a Progress charts page (Recharts), and a Settings page, with simple in-app navigation.

**Tech Stack:** Same backend (Python/FastAPI/SQLite/uv). Frontend adds **recharts** for charts; the calendar heatmap is a hand-built CSS grid.

**Scope note:** Phase 3 of the spec at `docs/superpowers/specs/2026-05-21-mathtrainer-design.md` (§7 habit, §8 Dashboard/Progress/Settings). The trick library and Learn mode are Phase 4. **Deliberate v1 scoping:** the daily goal is questions-per-day (the spec's "or M minutes" option is deferred); Settings covers the daily goal and session length (the spec's "enabled operations" toggle is deferred — all six operations stay enabled). Phases 1–2 are merged to `main`.

---

## File Structure

```
src/mathtrainer/
  schema.sql        # MODIFY: add settings table
  db.py             # MODIFY: settings load/save, all_sessions, all_attempts
  stats.py          # CREATE: pure aggregation (daily, streak, heatmap, series)
  models.py         # MODIFY: SettingsModel; session_length on SessionPlan
  app.py            # MODIFY: /api/settings, /api/dashboard, /api/progress; session_length in plan
tests/
  test_db.py        # MODIFY: settings round-trip, all_* fetchers
  test_stats.py     # CREATE: aggregation behaviour
  test_api.py       # MODIFY: settings, dashboard, progress endpoints
frontend/
  package.json      # MODIFY: recharts dependency
  src/lib/
    types.ts        # MODIFY: Dashboard/Progress/Settings types; sessionLength on SessionPlan
    api.ts          # MODIFY: getDashboard, getProgress, getSettings, putSettings
  src/
    App.tsx         # MODIFY: navigation between Dashboard/Practice/Progress/Settings
    components/
      Dashboard.tsx        # CREATE: streak, goal, sparkline, heatmap, CTA
      CalendarHeatmap.tsx  # CREATE: CSS-grid heatmap
      ProgressPage.tsx     # CREATE: Recharts charts
      SettingsPage.tsx     # CREATE: edit daily goal & session length
      PracticeScreen.tsx   # MODIFY: use plan.sessionLength for the question count
```

**Responsibilities:** `stats.py` is pure — row dicts in, aggregate dicts out — and is the only place habit/progress maths lives. `db.py` stays the only SQLite module. Each data-driven page (`Dashboard`, `ProgressPage`, `SettingsPage`) fetches its own data in a `useEffect` and owns its loading/error state; `App.tsx` only routes.

---

### Task 1: `settings` table & endpoint

**Files:** Modify `src/mathtrainer/schema.sql`, `src/mathtrainer/db.py`, `src/mathtrainer/models.py`, `src/mathtrainer/app.py`; test `tests/test_db.py`, `tests/test_api.py`.

- [ ] **Step 1: Add the `settings` table to `schema.sql`**

Append to `src/mathtrainer/schema.sql`:

```sql

CREATE TABLE IF NOT EXISTS settings (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    daily_goal      INTEGER NOT NULL DEFAULT 20,
    session_length  INTEGER NOT NULL DEFAULT 10
);
```

- [ ] **Step 2: Write the failing db test — append to `tests/test_db.py`:**

```python
def test_settings_defaults_and_save(tmp_path):
    conn = _conn(tmp_path)
    # defaults returned when no row exists
    s = db.load_settings(conn)
    assert s == {"daily_goal": 20, "session_length": 10}

    db.save_settings(conn, {"daily_goal": 30, "session_length": 15})
    assert db.load_settings(conn) == {"daily_goal": 30, "session_length": 15}
```

- [ ] **Step 3: Run it — `uv run pytest tests/test_db.py::test_settings_defaults_and_save -v`** — Expected: FAIL (`load_settings` missing).

- [ ] **Step 4: Add settings functions to `db.py`** — append at the end of `src/mathtrainer/db.py`:

```python
_DEFAULT_SETTINGS = {"daily_goal": 20, "session_length": 10}


def load_settings(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        "SELECT daily_goal, session_length FROM settings WHERE id = 1"
    ).fetchone()
    if row is None:
        return dict(_DEFAULT_SETTINGS)
    return {"daily_goal": row["daily_goal"], "session_length": row["session_length"]}


def save_settings(conn: sqlite3.Connection, settings: dict) -> None:
    conn.execute(
        "INSERT INTO settings (id, daily_goal, session_length) VALUES (1, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET daily_goal = excluded.daily_goal, "
        "session_length = excluded.session_length",
        (settings["daily_goal"], settings["session_length"]),
    )
    conn.commit()


def all_sessions(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT id, mode, started_at, ended_at, n_questions, total_score, "
        "rating_before, rating_after FROM sessions"
    ).fetchall()
    return [dict(r) for r in rows]


def all_attempts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT session_id, operation, is_correct, ms_to_submit FROM attempts"
    ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 5: Add the `SettingsModel` to `models.py`** — append to `src/mathtrainer/models.py`:

```python
class SettingsModel(BaseModel):
    daily_goal: int
    session_length: int
```

- [ ] **Step 6: Write the failing API test — append to `tests/test_api.py`:**

```python
def test_settings_get_and_put(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json() == {"daily_goal": 20, "session_length": 10}

    resp = client.put("/api/settings", json={"daily_goal": 25, "session_length": 12})
    assert resp.status_code == 200
    assert client.get("/api/settings").json() == {
        "daily_goal": 25, "session_length": 12,
    }
```

- [ ] **Step 7: Add the settings endpoints to `app.py`**

In `src/mathtrainer/app.py`, add `SettingsModel` to the `.models` import block. Add these two routes immediately after the `session_plan` route:

```python
@app.get("/api/settings", response_model=SettingsModel)
def get_settings() -> SettingsModel:
    conn = _get_conn()
    try:
        return SettingsModel(**db.load_settings(conn))
    finally:
        conn.close()


@app.put("/api/settings", response_model=SettingsModel)
def put_settings(body: SettingsModel) -> SettingsModel:
    conn = _get_conn()
    try:
        db.save_settings(conn, body.model_dump())
        return body
    finally:
        conn.close()
```

- [ ] **Step 8: Run the tests** — `uv run pytest tests/test_db.py tests/test_api.py -v` — Expected: PASS (new tests green, existing unaffected).

- [ ] **Step 9: Commit**

```bash
git add src/mathtrainer/schema.sql src/mathtrainer/db.py src/mathtrainer/models.py src/mathtrainer/app.py tests/test_db.py tests/test_api.py
git commit -m "feat: add settings table and settings endpoints"
git push -u origin feat/phase-3-progress-habit
```

---

### Task 2: `stats.py` — pure aggregation

**Files:** Create `src/mathtrainer/stats.py`, `tests/test_stats.py`.

- [ ] **Step 1: Write the failing test `tests/test_stats.py`:**

```python
from datetime import date

from mathtrainer import stats


def _session(id, ended_date, n_questions, score, rating_after, started=None):
    return {
        "id": id, "mode": "daily",
        "started_at": (started or f"{ended_date}T10:00:00+00:00"),
        "ended_at": f"{ended_date}T10:05:00+00:00",
        "n_questions": n_questions, "total_score": score,
        "rating_before": rating_after - 1, "rating_after": rating_after,
    }


def test_daily_aggregates_groups_by_date():
    sessions = [
        _session(1, "2026-05-10", 10, 100.0, 51),
        _session(2, "2026-05-10", 10, 120.0, 52),
        _session(3, "2026-05-12", 10, 90.0, 53),
    ]
    daily = stats.daily_aggregates(sessions)
    assert daily["2026-05-10"]["questions"] == 20
    assert daily["2026-05-10"]["score"] == 220.0
    assert daily["2026-05-12"]["questions"] == 10


def test_streak_counts_consecutive_met_days():
    daily = {
        "2026-05-18": {"questions": 20, "score": 0.0},
        "2026-05-19": {"questions": 25, "score": 0.0},
        "2026-05-20": {"questions": 20, "score": 0.0},
    }
    # today is 05-20, goal 20 -> 3-day streak
    assert stats.streak(daily, goal=20, today=date(2026, 5, 20)) == 3
    # a gap breaks it
    assert stats.streak(daily, goal=20, today=date(2026, 5, 22)) == 0


def test_streak_survives_an_unmet_today():
    daily = {
        "2026-05-18": {"questions": 20, "score": 0.0},
        "2026-05-19": {"questions": 20, "score": 0.0},
    }
    # today (05-20) has no session yet; streak through yesterday still counts
    assert stats.streak(daily, goal=20, today=date(2026, 5, 20)) == 2


def test_heatmap_has_one_cell_per_day():
    daily = {"2026-05-20": {"questions": 10, "score": 75.0}}
    cells = stats.heatmap(daily, today=date(2026, 5, 20), days=14)
    assert len(cells) == 14
    assert cells[-1] == {"date": "2026-05-20", "score": 75.0, "questions": 10}
    assert cells[0]["score"] == 0.0


def test_progress_series_and_operation_times():
    sessions = [
        _session(1, "2026-05-10", 2, 100.0, 51),
        _session(2, "2026-05-11", 2, 130.0, 53),
    ]
    attempts = [
        {"session_id": 1, "operation": "add", "is_correct": 1, "ms_to_submit": 2000},
        {"session_id": 1, "operation": "add", "is_correct": 0, "ms_to_submit": 3000},
        {"session_id": 2, "operation": "multiply", "is_correct": 1, "ms_to_submit": 4000},
        {"session_id": 2, "operation": "multiply", "is_correct": 1, "ms_to_submit": 6000},
    ]
    series = stats.progress_series(sessions, attempts)
    assert [p["n"] for p in series] == [1, 2]
    assert series[0]["rating"] == 51
    assert series[0]["accuracy"] == 0.5
    assert series[1]["accuracy"] == 1.0

    op_times = {o["operation"]: o["avg_ms"] for o in stats.operation_times(attempts)}
    assert op_times["add"] == 2000.0          # only the correct add counts
    assert op_times["multiply"] == 5000.0
```

- [ ] **Step 2: Run it — `uv run pytest tests/test_stats.py -v`** — Expected: FAIL (`No module named 'mathtrainer.stats'`).

- [ ] **Step 3: Create `src/mathtrainer/stats.py`:**

```python
"""Pure aggregation of sessions/attempts into habit and progress stats.

Row dicts in, plain aggregate structures out. No database access here.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta


def _date_of(iso_ts: str) -> str:
    """The 'YYYY-MM-DD' part of an ISO timestamp."""
    return iso_ts[:10]


def daily_aggregates(sessions: list[dict]) -> dict[str, dict]:
    """Maps date string -> {questions, score, minutes} over finished sessions."""
    out: dict[str, dict] = {}
    for s in sessions:
        if not s.get("ended_at"):
            continue
        day = _date_of(s["ended_at"])
        agg = out.setdefault(day, {"questions": 0, "score": 0.0, "minutes": 0.0})
        agg["questions"] += s["n_questions"]
        agg["score"] += s["total_score"]
        if s.get("started_at"):
            seconds = (
                datetime.fromisoformat(s["ended_at"])
                - datetime.fromisoformat(s["started_at"])
            ).total_seconds()
            agg["minutes"] += max(0.0, seconds / 60.0)
    return out


def streak(daily: dict[str, dict], goal: int, today: date) -> int:
    """Consecutive days, ending at `today`, whose question count met `goal`.
    An as-yet-unmet `today` does not break a streak earned through yesterday."""
    count = 0
    day = today
    while True:
        agg = daily.get(day.isoformat())
        met = agg is not None and agg["questions"] >= goal
        if met:
            count += 1
            day -= timedelta(days=1)
        elif day == today:
            day -= timedelta(days=1)   # today not done yet — look back
        else:
            break
    return count


def heatmap(daily: dict[str, dict], today: date, days: int = 112) -> list[dict]:
    """One cell per day for the last `days` days, oldest first."""
    cells = []
    for i in range(days - 1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        agg = daily.get(day)
        cells.append({
            "date": day,
            "score": agg["score"] if agg else 0.0,
            "questions": agg["questions"] if agg else 0,
        })
    return cells


def progress_series(sessions: list[dict], attempts: list[dict]) -> list[dict]:
    """Per finished session (chronological): rating, score, accuracy."""
    finished = sorted(
        (s for s in sessions if s.get("ended_at")), key=lambda s: s["ended_at"]
    )
    correct_total: dict[int, list[int]] = {}
    for a in attempts:
        c = correct_total.setdefault(a["session_id"], [0, 0])
        c[1] += 1
        if a["is_correct"]:
            c[0] += 1
    series = []
    for n, s in enumerate(finished, start=1):
        corr, tot = correct_total.get(s["id"], [0, 0])
        series.append({
            "n": n,
            "rating": s.get("rating_after"),
            "score": s["total_score"],
            "accuracy": (corr / tot) if tot else 0.0,
        })
    return series


def operation_times(attempts: list[dict]) -> list[dict]:
    """Average solve-time (ms) per operation, over correct attempts only."""
    sums: dict[str, list[float]] = {}
    for a in attempts:
        if not a["is_correct"]:
            continue
        agg = sums.setdefault(a["operation"], [0.0, 0])
        agg[0] += a["ms_to_submit"]
        agg[1] += 1
    return [
        {"operation": op, "avg_ms": total / n}
        for op, (total, n) in sorted(sums.items()) if n
    ]
```

- [ ] **Step 4: Run it — `uv run pytest tests/test_stats.py -v`** — Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/mathtrainer/stats.py tests/test_stats.py
git commit -m "feat: add pure stats aggregation (daily, streak, heatmap, series)"
git push
```

---

### Task 3: `/api/dashboard` & `/api/progress` endpoints

**Files:** Modify `src/mathtrainer/app.py`; test `tests/test_api.py`.

- [ ] **Step 1: Write the failing test — append to `tests/test_api.py`:**

```python
def _finish_a_session(client, n_correct, n_total, difficulty=45.0):
    sid = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    attempts = []
    for i in range(n_total):
        attempts.append({
            "operation": "add", "operands": [1, 2], "correct_answer": 3,
            "given_answer": 3 if i < n_correct else 9,
            "is_correct": i < n_correct, "difficulty": difficulty,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": None, "score": 0.0,
        })
    return client.post(f"/api/sessions/{sid}/finish", json={"attempts": attempts})


def test_dashboard_reports_streak_and_heatmap(client):
    _finish_a_session(client, 8, 10)
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"]["questions"] == 10
    assert body["today"]["goal"] == 20
    assert body["total_sessions"] == 1
    assert isinstance(body["heatmap"], list) and len(body["heatmap"]) > 0
    assert "streak" in body and "rating" in body


def test_progress_reports_history(client):
    _finish_a_session(client, 9, 10)
    _finish_a_session(client, 7, 10)
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["history"]) == 2
    assert [p["n"] for p in body["history"]] == [1, 2]
    assert isinstance(body["operation_times"], list)
```

- [ ] **Step 2: Run it — `uv run pytest tests/test_api.py -k "dashboard or progress" -v`** — Expected: FAIL (routes 404).

- [ ] **Step 3: Add the endpoints to `app.py`**

In `src/mathtrainer/app.py`, add to the imports near the top: replace `from . import db, model` with:

```python
from datetime import date

from . import db, model, stats
```

(If `from datetime import ...` already exists, merge the `date` import into it rather than duplicating.)

Add these two routes immediately after `put_settings`:

```python
@app.get("/api/dashboard")
def dashboard() -> dict:
    conn = _get_conn()
    try:
        settings = db.load_settings(conn)
        sessions = db.all_sessions(conn)
        attempts = db.all_attempts(conn)
        daily = stats.daily_aggregates(sessions)
        today = date.today()
        model_state = db.load_model_state(conn) or model.default_model_state()
        series = stats.progress_series(sessions, attempts)
        today_agg = daily.get(today.isoformat())
        return {
            "streak": stats.streak(daily, settings["daily_goal"], today),
            "today": {
                "questions": today_agg["questions"] if today_agg else 0,
                "goal": settings["daily_goal"],
            },
            "rating": model_state["rating"],
            "rating_sparkline": [p["rating"] for p in series[-12:]],
            "heatmap": stats.heatmap(daily, today),
            "total_sessions": len([s for s in sessions if s.get("ended_at")]),
        }
    finally:
        conn.close()


@app.get("/api/progress")
def progress() -> dict:
    conn = _get_conn()
    try:
        sessions = db.all_sessions(conn)
        attempts = db.all_attempts(conn)
        return {
            "history": stats.progress_series(sessions, attempts),
            "operation_times": stats.operation_times(attempts),
        }
    finally:
        conn.close()
```

- [ ] **Step 4: Run the full backend suite — `uv run pytest -v`** — Expected: PASS (everything green).

- [ ] **Step 5: Commit**

```bash
git add src/mathtrainer/app.py tests/test_api.py
git commit -m "feat: add dashboard and progress endpoints"
git push
```

---

### Task 4: Frontend data layer — recharts, types, API client

**Files:** Modify `frontend/package.json` (via npm), `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/components/PracticeScreen.tsx`, `frontend/src/lib/models` (none). Also `src/mathtrainer/models.py` + `app.py` for `session_length` on the plan.

- [ ] **Step 1: Install recharts**

```bash
cd ~/Github/mathtrainer/frontend && npm install recharts
```

- [ ] **Step 2: Add `session_length` to the backend session plan**

In `src/mathtrainer/models.py`, replace the `SessionPlan` class with:

```python
class SessionPlan(BaseModel):
    rating: float
    target_band: DifficultyBandModel
    weak_operations: list[str]
    session_length: int
```

In `src/mathtrainer/app.py`, in the `session_plan()` route, replace the `return SessionPlan(...)` statement with:

```python
        return SessionPlan(
            rating=state["rating"],
            target_band={"min": band["min"], "max": band["max"]},
            weak_operations=model.weak_operations(state),
            session_length=db.load_settings(conn)["session_length"],
        )
```

- [ ] **Step 3: Update `tests/test_api.py` for the plan's new field**

In `tests/test_api.py`, in `test_session_plan_default_for_fresh_db`, add this assertion at the end of the function:

```python
    assert body["session_length"] == 10
```

Run: `uv run pytest tests/test_api.py -v` — Expected: PASS.

- [ ] **Step 4: Add frontend types** — append to `frontend/src/lib/types.ts`:

```typescript
export interface HeatmapCell {
  date: string
  score: number
  questions: number
}

export interface Dashboard {
  streak: number
  today: { questions: number; goal: number }
  rating: number
  ratingSparkline: number[]
  heatmap: HeatmapCell[]
  totalSessions: number
}

export interface ProgressPoint {
  n: number
  rating: number | null
  score: number
  accuracy: number
}

export interface OperationTime {
  operation: string
  avgMs: number
}

export interface Progress {
  history: ProgressPoint[]
  operationTimes: OperationTime[]
}

export interface Settings {
  dailyGoal: number
  sessionLength: number
}
```

Also, in the same file, replace the existing `SessionPlan` interface with:

```typescript
export interface SessionPlan {
  rating: number
  targetBand: DifficultyBand
  weakOperations: Operation[]
  sessionLength: number
}
```

- [ ] **Step 5: Add API client functions** — in `frontend/src/lib/api.ts`:

In `getSessionPlan`, replace the `return { ... }` object with:

```typescript
  return {
    rating: raw.rating as number,
    targetBand: { min: raw.target_band.min, max: raw.target_band.max },
    weakOperations: raw.weak_operations as Operation[],
    sessionLength: raw.session_length as number,
  }
```

Add this import line at the top, replacing the existing `import type { Operation, QuestionResult, SessionPlan } from './types'`:

```typescript
import type {
  Dashboard, Operation, Progress, QuestionResult, SessionPlan, Settings,
} from './types'
```

Append these functions to the end of `api.ts`:

```typescript
export async function getDashboard(): Promise<Dashboard> {
  const resp = await fetch('/api/dashboard')
  if (!resp.ok) throw new Error(`getDashboard failed: ${resp.status}`)
  const r = await resp.json()
  return {
    streak: r.streak,
    today: r.today,
    rating: r.rating,
    ratingSparkline: r.rating_sparkline,
    heatmap: r.heatmap,
    totalSessions: r.total_sessions,
  }
}

export async function getProgress(): Promise<Progress> {
  const resp = await fetch('/api/progress')
  if (!resp.ok) throw new Error(`getProgress failed: ${resp.status}`)
  const r = await resp.json()
  return {
    history: r.history,
    operationTimes: r.operation_times.map(
      (o: { operation: string; avg_ms: number }) => ({
        operation: o.operation, avgMs: o.avg_ms,
      }),
    ),
  }
}

export async function getSettings(): Promise<Settings> {
  const resp = await fetch('/api/settings')
  if (!resp.ok) throw new Error(`getSettings failed: ${resp.status}`)
  const r = await resp.json()
  return { dailyGoal: r.daily_goal, sessionLength: r.session_length }
}

export async function putSettings(s: Settings): Promise<void> {
  const resp = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      daily_goal: s.dailyGoal, session_length: s.sessionLength,
    }),
  })
  if (!resp.ok) throw new Error(`putSettings failed: ${resp.status}`)
}
```

- [ ] **Step 6: Make `PracticeScreen` use `plan.sessionLength`**

In `frontend/src/components/PracticeScreen.tsx`, remove the `const TOTAL = 10` line. Then, inside the component body (right after `export function PracticeScreen({ plan, onComplete }: Props) {`), add:

```tsx
  const TOTAL = plan.sessionLength
```

(Everything that referenced `TOTAL` still works — it is now a per-render const from the plan.)

- [ ] **Step 7: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — Expected: zero errors.
Run: `cd frontend && npm test` — Expected: 18 tests still pass.
Run: `uv run pytest -v` — Expected: all backend tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/mathtrainer/models.py src/mathtrainer/app.py tests/test_api.py frontend/package.json frontend/package-lock.json frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/components/PracticeScreen.tsx
git commit -m "feat: add recharts, progress/dashboard/settings types and API client"
git push
```

---

### Task 5: Dashboard page & calendar heatmap

**Files:** Create `frontend/src/components/CalendarHeatmap.tsx`, `frontend/src/components/Dashboard.tsx`; modify `frontend/src/App.tsx`.

- [ ] **Step 1: Create `frontend/src/components/CalendarHeatmap.tsx`:**

```tsx
import type { HeatmapCell } from '../lib/types'

interface Props {
  cells: HeatmapCell[]
}

function shade(score: number, max: number): string {
  if (score <= 0) return '#ebedf0'
  const t = max > 0 ? score / max : 0
  if (t < 0.25) return '#c6e48b'
  if (t < 0.5) return '#7bc96f'
  if (t < 0.75) return '#239a3b'
  return '#196127'
}

/** A GitHub-style heatmap: 7 rows (days) by N columns (weeks). */
export function CalendarHeatmap({ cells }: Props) {
  const max = cells.reduce((m, c) => Math.max(m, c.score), 0)
  const weeks: HeatmapCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {week.map((c) => (
            <div
              key={c.date}
              title={`${c.date}: ${c.questions} questions`}
              style={{
                width: 12, height: 12, borderRadius: 2,
                background: shade(c.score, max),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/Dashboard.tsx`:**

```tsx
import { useEffect, useState } from 'react'
import type { Dashboard as DashboardData } from '../lib/types'
import { getDashboard } from '../lib/api'
import { CalendarHeatmap } from './CalendarHeatmap'

interface Props {
  onStartDrill: () => void
  onOpenProgress: () => void
  onOpenSettings: () => void
}

export function Dashboard({ onStartDrill, onOpenProgress, onOpenSettings }: Props) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh' }}>
        <h1>mathtrainer</h1>
        <p style={{ color: 'crimson' }}>Could not load dashboard: {error}</p>
        <button onClick={onStartDrill} style={{ fontSize: 18, padding: '10px 24px' }}>
          Start daily drill
        </button>
      </div>
    )
  }
  if (!data) {
    return <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
  }

  const pct = data.today.goal > 0
    ? Math.min(100, (data.today.questions / data.today.goal) * 100)
    : 0

  return (
    <div style={{ maxWidth: 560, margin: '8vh auto', textAlign: 'center' }}>
      <h1>mathtrainer</h1>
      <div style={{ display: 'flex', justifyContent: 'space-around', margin: '24px 0' }}>
        <div>
          <div style={{ fontSize: 38 }}>🔥 {data.streak}</div>
          <div style={{ color: '#888' }}>day streak</div>
        </div>
        <div>
          <div style={{ fontSize: 38 }}>{data.rating.toFixed(0)}</div>
          <div style={{ color: '#888' }}>rating</div>
        </div>
        <div>
          <div style={{ fontSize: 38 }}>{data.totalSessions}</div>
          <div style={{ color: '#888' }}>sessions</div>
        </div>
      </div>

      <div style={{ margin: '20px 0' }}>
        <div style={{ color: '#888', marginBottom: 4 }}>
          Today: {data.today.questions} / {data.today.goal} questions
        </div>
        <div style={{ background: '#ebedf0', borderRadius: 6, height: 14 }}>
          <div style={{
            width: `${pct}%`, height: 14, borderRadius: 6, background: '#239a3b',
          }} />
        </div>
      </div>

      <button
        onClick={onStartDrill}
        style={{ fontSize: 20, padding: '12px 28px', margin: '8px 0' }}
      >
        Start daily drill
      </button>

      <div style={{ margin: '28px 0 8px', color: '#888' }}>Activity</div>
      <CalendarHeatmap cells={data.heatmap} />

      <div style={{ marginTop: 28 }}>
        <button onClick={onOpenProgress} style={{ marginRight: 12, padding: '8px 18px' }}>
          Progress
        </button>
        <button onClick={onOpenSettings} style={{ padding: '8px 18px' }}>
          Settings
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Rewrite `frontend/src/App.tsx` for navigation**

Replace the entire contents of `frontend/src/App.tsx`:

```tsx
import { useState } from 'react'
import type { QuestionResult, SessionPlan } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { Dashboard } from './components/Dashboard'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'
import { ProgressPage } from './components/ProgressPage'
import { SettingsPage } from './components/SettingsPage'

type Screen =
  | 'dashboard' | 'loading' | 'practice' | 'summary' | 'progress' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setScreen('loading')
    setError(null)
    try {
      setPlan(await getSessionPlan())
      setScreen('practice')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setScreen('dashboard')
    }
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
  if (screen === 'practice' && plan) {
    return <PracticeScreen plan={plan} onComplete={handleComplete} />
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
  return (
    <Dashboard
      onStartDrill={handleStart}
      onOpenProgress={() => setScreen('progress')}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: errors ONLY about the missing `./components/ProgressPage` and `./components/SettingsPage` modules — those are created in Task 6. Confirm there are no OTHER errors. Do not fix these here.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalendarHeatmap.tsx frontend/src/components/Dashboard.tsx frontend/src/App.tsx
git commit -m "feat: add Dashboard page with streak, goal and calendar heatmap"
git push
```

---

### Task 6: Progress page & Settings page

**Files:** Create `frontend/src/components/ProgressPage.tsx`, `frontend/src/components/SettingsPage.tsx`.

- [ ] **Step 1: Create `frontend/src/components/ProgressPage.tsx`:**

```tsx
import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { Progress } from '../lib/types'
import { getProgress } from '../lib/api'

interface Props {
  onBack: () => void
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
    <div style={{ maxWidth: 640, margin: '6vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Progress</h2>

      {error && <p style={{ color: 'crimson' }}>Could not load progress: {error}</p>}
      {!error && !data && <p style={{ textAlign: 'center' }}>Loading…</p>}

      {data && data.history.length === 0 && (
        <p style={{ textAlign: 'center', color: '#888' }}>
          No finished sessions yet — complete a drill to see your progress.
        </p>
      )}

      {data && data.history.length > 0 && (
        <>
          <h3>Rating over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="n" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="rating" stroke="#239a3b" />
            </LineChart>
          </ResponsiveContainer>

          <h3>Score per session</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="n" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#1f6feb" />
            </LineChart>
          </ResponsiveContainer>

          <h3>Average time per operation (s)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data.operationTimes.map((o) => ({
                operation: o.operation,
                seconds: Number((o.avgMs / 1000).toFixed(2)),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="operation" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="seconds" fill="#a6611a" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/SettingsPage.tsx`:**

```tsx
import { useEffect, useState } from 'react'
import type { Settings } from '../lib/types'
import { getSettings, putSettings } from '../lib/api'

interface Props {
  onBack: () => void
}

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
    <div style={{ maxWidth: 420, margin: '8vh auto', padding: '0 16px' }}>
      <button onClick={onBack} style={{ padding: '6px 14px' }}>← Back</button>
      <h2 style={{ textAlign: 'center' }}>Settings</h2>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!error && !settings && <p>Loading…</p>}

      {settings && (
        <>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Daily goal (questions per day)
            <input
              type="number" min={1}
              value={settings.dailyGoal}
              onChange={(e) => update({ dailyGoal: Number(e.target.value) })}
              style={{ display: 'block', fontSize: 18, width: 120, marginTop: 4 }}
            />
          </label>
          <label style={{ display: 'block', margin: '16px 0' }}>
            Questions per drill
            <input
              type="number" min={1} max={50}
              value={settings.sessionLength}
              onChange={(e) => update({ sessionLength: Number(e.target.value) })}
              style={{ display: 'block', fontSize: 18, width: 120, marginTop: 4 }}
            />
          </label>
          <button onClick={save} style={{ fontSize: 16, padding: '8px 20px' }}>
            Save
          </button>
          {status && <span style={{ color: 'green', marginLeft: 12 }}>{status}</span>}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify type-check, tests, and build**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — Expected: ZERO errors (the Task 5 missing-module errors are now resolved).
Run: `cd frontend && npm test` — Expected: 18 tests pass.
Run: `cd frontend && npm run build` — Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProgressPage.tsx frontend/src/components/SettingsPage.tsx
git commit -m "feat: add Progress charts page and Settings page"
git push
```

---

### Task 7: End-to-end verification & merge to main

**Files:** No source changes.

- [ ] **Step 1: Backend & frontend suites**

Run: `uv run pytest -q` — Expected: PASS (test_db, test_model, test_stats, test_api).
Run: `cd frontend && npm test && npm run build` — Expected: 18 tests pass; build succeeds.

- [ ] **Step 2: End-to-end with Playwright**

Start the server in the background from the repo root (`uv run mathtrainer`); poll `curl -s http://127.0.0.1:8000/api/health`.

Using the Playwright browser tools at `http://127.0.0.1:8000`:
- Confirm the **Dashboard** renders: "mathtrainer", a streak / rating / sessions row, a "Today: X / 20 questions" progress bar, a "Start daily drill" button, an "Activity" heatmap grid, and "Progress" / "Settings" buttons.
- Click "Start daily drill", complete the 10-question drill, and on the Summary click "Drill again" — confirm it returns to the **Dashboard** and the streak/today count have updated.
- From the Dashboard click **Settings**: change "Questions per drill" to 5, click Save (confirm "Saved."), click "← Back".
- Click "Start daily drill" again — confirm the drill now ends after **5** questions (the new session length took effect).
- From the Dashboard click **Progress**: confirm the page shows the three charts ("Rating over time", "Score per session", "Average time per operation") with data, then "← Back".

Stop the background server.

- [ ] **Step 3: Verify persistence**

```bash
cd /home/musel/Github/mathtrainer
uv run python -c "
from mathtrainer import db
conn = db.get_connection('mathtrainer.db')
s = db.load_settings(conn)
sess = conn.execute('SELECT COUNT(*) c FROM sessions WHERE ended_at IS NOT NULL').fetchone()['c']
assert s['session_length'] == 5, s
print(f'settings={s} finished_sessions={sess}')
print('phase 3 persistence OK')
"
```
Expected: prints the settings (session_length 5) and `phase 3 persistence OK`.

- [ ] **Step 4: Merge to main**

```bash
cd /home/musel/Github/mathtrainer
git checkout main
git merge --no-ff feat/phase-3-progress-habit -m "feat: Phase 3 — progress graphs, habit streak, dashboard"
git push origin main
git branch -d feat/phase-3-progress-habit
git push origin --delete feat/phase-3-progress-habit
```

---

## Self-Review

**Spec coverage (spec §7 habit, §8 Dashboard/Progress/Settings):**
- Daily goal — `settings.daily_goal`, Task 1; editable in Settings, Task 6. (Questions-per-day; the "or minutes" option is a noted deferral.)
- Streak — `stats.streak`, Task 2; shown on the Dashboard, Task 5.
- Calendar heatmap — `stats.heatmap`, Task 2; `CalendarHeatmap` component, Task 5.
- Dashboard (streak, today's goal, Start CTA, rating, sessions count, heatmap) — Task 5.
- Progress charts (rating over time, score per session, avg time per operation) — `stats.progress_series`/`operation_times`, Task 2; `ProgressPage`, Task 6.
- Settings (daily goal, session length) — Task 1 + Task 6. ("Enabled operations" is a noted deferral.)
- Daily aggregates derived by query (not stored) — `stats.daily_aggregates` over `db.all_sessions`, Tasks 2–3.
- Out of scope by design: trick library, Learn mode (Phase 4); the spec's minutes-goal and operation-toggle options (noted deferrals).

**Placeholder scan:** No `TBD`/`TODO`. Every code step is complete. Two deliberately-deferred intermediate states are flagged with their resolving task: Task 5 Step 4 (`tsc` reports only missing `ProgressPage`/`SettingsPage` until Task 6 creates them).

**Type consistency:** Backend endpoints return snake_case dicts (`rating_sparkline`, `operation_times`, `daily_goal`, `session_length`, `total_sessions`); the `api.ts` client maps each to camelCase (`ratingSparkline`, `operationTimes`, `dailyGoal`, `sessionLength`, `totalSessions`) into the `Dashboard`/`Progress`/`Settings` TS interfaces — verified field-by-field. `SessionPlan` gains `session_length`→`sessionLength` consistently in `models.py`, `app.py`, the TS type, and `getSessionPlan`. `PracticeScreen`'s `TOTAL` is sourced from `plan.sessionLength`. `HeatmapCell`/`ProgressPoint`/`OperationTime` shapes match what `stats.py` emits (`date`/`score`/`questions`, `n`/`rating`/`score`/`accuracy`, `operation`/`avg_ms`).
