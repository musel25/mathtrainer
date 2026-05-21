# Per-operation Ability Ratings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the six operations its own 1–100 Elo-style rating, show those ratings on the Progress page, and bias question generation toward weaker operations.

**Architecture:** Replace the per-operation `residuals` map (which only produced a binary "weak operation" flag) with a per-operation `operations` map holding an Elo rating per operation. The model column `model_state.residuals` is renamed to `operations`; existing databases get a one-time backfill that replays attempt history. The frontend question generator weights operation selection by rating, and the Progress page gains an "Ability by operation" bar chart.

**Tech Stack:** Python 3.12 / FastAPI / SQLite (backend, `uv run pytest`); React 19 / TypeScript / Vite / recharts / Vitest (frontend).

---

## Reference: design spec

`docs/superpowers/specs/2026-05-21-operation-ratings-design.md`

## File map

- `src/mathtrainer/model.py` — per-operation rating logic (modify)
- `src/mathtrainer/db.py` — column rename, load/save, backfill (modify)
- `src/mathtrainer/schema.sql` — `model_state` column rename (modify)
- `src/mathtrainer/models.py` — `SessionPlan` response model (modify)
- `src/mathtrainer/app.py` — `/api/session-plan`, `/api/progress` (modify)
- `tests/test_model.py`, `tests/test_db.py`, `tests/test_api.py` (modify)
- `frontend/src/lib/types.ts` — `SessionPlan`, `Progress` types (modify)
- `frontend/src/lib/api.ts` — `getSessionPlan`, `getProgress` mappers (modify)
- `frontend/src/lib/questionGenerator.ts` — rating-weighted operation pool (modify)
- `frontend/src/lib/questionGenerator.test.ts` — weighted-pool tests (modify)
- `frontend/src/App.tsx` — pass `operationRatings` into the generator (modify)
- `frontend/src/components/ProgressPage.tsx` — ability bar chart (modify)

## Conventions

- Backend tests: `uv run pytest` from the repo root.
- Frontend tests: `npm test` from `frontend/` (runs `vitest run`).
- Frontend build / type-check: `npm run build` from `frontend/` (runs `tsc -b && vite build`).
- The six operations are: `add`, `subtract`, `multiply`, `divide`, `square`, `percent`.

---

## Task 1: Per-operation ratings — model and persistence

Replaces the `residuals` per-operation structure with an `operations` map of
Elo ratings, and renames the storage column. The API still calls
`model.weak_operations()` (redefined here), so it keeps working unchanged.

**Files:**
- Modify: `src/mathtrainer/model.py`
- Modify: `tests/test_model.py`
- Modify: `src/mathtrainer/db.py`
- Modify: `src/mathtrainer/schema.sql`
- Modify: `tests/test_db.py`

- [ ] **Step 1: Update `tests/test_model.py` — replace residual-based tests with rating-based tests**

In `tests/test_model.py`, change line 10 inside `test_default_state_shape` from:

```python
    assert set(s["residuals"]) == set(model.OPERATIONS)
```

to:

```python
    assert set(s["operations"]) == set(model.OPERATIONS)
```

In `test_target_band_tracks_rating`, change the two state literals to use
`"operations"` instead of `"residuals"`:

```python
def test_target_band_tracks_rating():
    low = model.target_band({"rating": 20.0, "bins": [], "operations": {}})
    high = model.target_band({"rating": 80.0, "bins": [], "operations": {}})
    assert high["min"] > low["min"]
    assert 1.0 <= low["min"] <= low["max"] <= 100.0
    assert 1.0 <= high["min"] <= high["max"] <= 100.0
```

Delete `test_persistently_slow_operation_is_flagged_weak`,
`test_wrong_answer_does_not_update_residuals_or_bins`, and
`test_weak_operations_respects_min_samples_threshold`. Replace them by
appending these tests to the file:

```python
def test_operations_seeded_at_default_rating():
    s = model.default_model_state()
    assert set(s["operations"]) == set(model.OPERATIONS)
    for rec in s["operations"].values():
        assert rec["rating"] == model.DEFAULT_RATING
        assert rec["count"] == 0


def test_fast_correct_answers_raise_operation_rating():
    s = model.default_model_state()
    for _ in range(20):
        s, _ = model.process_attempt(s, "multiply", 45, is_correct=True, solve_ms=200)
    assert s["operations"]["multiply"]["rating"] > model.DEFAULT_RATING


def test_wrong_answer_updates_op_rating_but_not_bins():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=False, solve_ms=500)
    assert s2["bins"][4]["count"] == 0
    assert s2["operations"]["add"]["count"] == 1
    assert s2["operations"]["add"]["rating"] < model.DEFAULT_RATING


def test_process_attempt_only_updates_the_target_operation():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
    assert s2["operations"]["add"]["count"] == 1
    assert s2["operations"]["subtract"] == {"rating": model.DEFAULT_RATING, "count": 0}


def test_operation_rating_stays_in_bounds():
    s = model.default_model_state()
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 90, is_correct=True, solve_ms=50)
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 10, is_correct=False, solve_ms=9000)
    assert 1.0 <= s["operations"]["add"]["rating"] <= 100.0


def test_operation_ratings_accessor_returns_all_operations():
    s = model.default_model_state()
    ratings = model.operation_ratings(s)
    assert set(ratings) == set(model.OPERATIONS)
    assert ratings["add"] == model.DEFAULT_RATING


def test_low_rated_operation_is_flagged_weak():
    s = model.default_model_state()
    for _ in range(30):
        s, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
        s, _ = model.process_attempt(s, "divide", 45, is_correct=False, solve_ms=9000)
    weak = model.weak_operations(s)
    assert "divide" in weak
    assert "add" not in weak


def test_weak_operations_ignores_operations_below_min_samples():
    s = model.default_model_state()
    for _ in range(model.WEAK_MIN_SAMPLES - 1):
        s, _ = model.process_attempt(s, "divide", 45, is_correct=False, solve_ms=9000)
    assert "divide" not in model.weak_operations(s)
```

- [ ] **Step 2: Run the model tests to verify they fail**

Run: `uv run pytest tests/test_model.py -q`
Expected: FAIL — `KeyError: 'operations'` / `AttributeError: module 'mathtrainer.model' has no attribute 'operation_ratings'`.

- [ ] **Step 3: Rewrite the per-operation section of `src/mathtrainer/model.py`**

In the module docstring, replace the `State shape:` block with:

```python
State shape:
    {
      "rating": float,                       # 1..100, Elo-style (overall)
      "bins": [{"mean", "var", "count"}] * N_BINS,   # solve-time EWMA per
                                             # difficulty bin (correct answers)
      "operations": {operation: {"rating", "count"}},  # per-operation
                                             # Elo-style rating, 1..100
    }
```

In the constants block, delete the line `WEAK_RESIDUAL_MS = 1200.0 ...`, keep
`WEAK_MIN_SAMPLES = 3`, and add directly below it:

```python
WEAK_RATING_MARGIN = 8.0       # operation is "weak" when its rating is this far below overall
```

Replace `default_model_state` with:

```python
def default_model_state() -> dict:
    return {
        "rating": DEFAULT_RATING,
        "bins": [{"mean": 0.0, "var": 0.0, "count": 0} for _ in range(N_BINS)],
        "operations": {
            op: {"rating": DEFAULT_RATING, "count": 0} for op in OPERATIONS
        },
    }
```

Delete the entire `_update_residual` function. Add this function in its place:

```python
def _update_op_rating(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> dict:
    """Elo-style update of one operation's own rating, scored against that
    operation's current rating. Mirrors `_update_rating` but per-operation."""
    operations = {op: dict(v) for op, v in state["operations"].items()}
    rec = operations.setdefault(operation, {"rating": DEFAULT_RATING, "count": 0})
    r = rec["rating"]
    p = 1.0 / (1.0 + math.exp(-(r - difficulty) / RATING_SCALE))
    success = 1.0 if (is_correct and solve_ms <= expected_time(state, difficulty)) else 0.0
    rec["rating"] = max(1.0, min(100.0, r + RATING_K * (success - p)))
    rec["count"] = rec["count"] + 1
    return {**state, "operations": operations}
```

Replace `process_attempt` with:

```python
def process_attempt(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> tuple[dict, float]:
    """Scores one attempt against the CURRENT state, then returns the updated
    state and the score. Score and ratings are measured against the pre-update
    baseline. Pure: `state` is not mutated."""
    score = score_attempt(state, difficulty, is_correct, solve_ms)
    new_state = _update_rating(state, difficulty, is_correct, solve_ms)
    new_state = _update_op_rating(
        new_state, operation, difficulty, is_correct, solve_ms,
    )
    if is_correct:
        new_state = _update_bin(new_state, difficulty, solve_ms)
    return new_state, score
```

Replace `weak_operations` with:

```python
def operation_ratings(state: dict) -> dict:
    """Each operation's current rating (1..100)."""
    return {op: rec["rating"] for op, rec in state["operations"].items()}


def weak_operations(state: dict) -> list[str]:
    """Operations whose own rating sits well below the overall rating —
    candidates for extra practice. Operations with too few attempts to be
    reliable are excluded."""
    overall = state["rating"]
    return [
        op for op, rec in state["operations"].items()
        if rec["count"] >= WEAK_MIN_SAMPLES
        and overall - rec["rating"] > WEAK_RATING_MARGIN
    ]
```

- [ ] **Step 4: Run the model tests to verify they pass**

Run: `uv run pytest tests/test_model.py -q`
Expected: PASS — all model tests green.

- [ ] **Step 5: Update `tests/test_db.py` — operations column round-trip and rename migration**

At the top of `tests/test_db.py`, add `model` to the import line so it reads:

```python
import json
from mathtrainer import db, model
```

Add this legacy-schema helper directly below the existing `_conn` helper:

```python
_LEGACY_SCHEMA = """
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mode TEXT NOT NULL,
    started_at TEXT NOT NULL, ended_at TEXT,
    n_questions INTEGER NOT NULL DEFAULT 0, total_score REAL NOT NULL DEFAULT 0,
    rating_before REAL, rating_after REAL);
CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL,
    ts TEXT NOT NULL, operation TEXT NOT NULL, operands TEXT NOT NULL,
    correct_answer INTEGER NOT NULL, given_answer INTEGER,
    is_correct INTEGER NOT NULL, difficulty REAL NOT NULL, features TEXT NOT NULL,
    ms_to_first_key INTEGER, ms_to_submit INTEGER NOT NULL, trick_slug TEXT,
    score REAL NOT NULL DEFAULT 0);
CREATE TABLE model_state (
    id INTEGER PRIMARY KEY CHECK (id = 1), rating REAL NOT NULL,
    bins TEXT NOT NULL, residuals TEXT NOT NULL, updated_at TEXT);
"""


def _legacy_conn(tmp_path):
    """A connection to a database built with the pre-operations schema."""
    conn = db.get_connection(tmp_path / "legacy.db")
    conn.executescript(_LEGACY_SCHEMA)
    conn.commit()
    return conn
```

Replace the existing `test_model_state_round_trip` with:

```python
def test_model_state_round_trip(tmp_path):
    conn = _conn(tmp_path)
    assert db.load_model_state(conn) is None

    state = model.default_model_state()
    state["rating"] = 57.5
    db.save_model_state(conn, state)
    assert db.load_model_state(conn) == state

    state["rating"] = 60.0
    db.save_model_state(conn, state)
    assert db.load_model_state(conn)["rating"] == 60.0
```

Append this new test:

```python
def test_model_state_migration_renames_residuals_column(tmp_path):
    conn = _legacy_conn(tmp_path)
    conn.execute(
        "INSERT INTO model_state (id, rating, bins, residuals) "
        "VALUES (1, 50.0, '[]', '{}')"
    )
    conn.commit()
    db._migrate(conn)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(model_state)")}
    assert "operations" in cols
    assert "residuals" not in cols
```

- [ ] **Step 6: Run the db tests to verify they fail**

Run: `uv run pytest tests/test_db.py -q`
Expected: FAIL — `sqlite3.OperationalError: no such column: operations`.

- [ ] **Step 7: Update `src/mathtrainer/schema.sql` and `src/mathtrainer/db.py`**

In `src/mathtrainer/schema.sql`, in the `model_state` table, rename the
`residuals` column so the table reads:

```sql
CREATE TABLE IF NOT EXISTS model_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    rating      REAL NOT NULL,
    bins        TEXT NOT NULL,
    operations  TEXT NOT NULL,
    updated_at  TEXT
);
```

In `src/mathtrainer/db.py`, change the import line to:

```python
from . import model
```

(Add it directly after the existing `from pathlib import Path` line.)

Replace `_migrate` with:

```python
def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent schema migrations for databases created by older versions."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    if "rating_before" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_before REAL")
    if "rating_after" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_after REAL")

    ms_cols = {r["name"] for r in conn.execute("PRAGMA table_info(model_state)")}
    if "residuals" in ms_cols and "operations" not in ms_cols:
        conn.execute(
            "ALTER TABLE model_state RENAME COLUMN residuals TO operations"
        )
    conn.commit()
```

Replace `load_model_state` with:

```python
def load_model_state(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute(
        "SELECT rating, bins, operations FROM model_state WHERE id = 1"
    ).fetchone()
    if row is None:
        return None
    raw_ops = json.loads(row["operations"])
    operations = {
        op: {
            "rating": float(raw_ops.get(op, {}).get("rating", model.DEFAULT_RATING)),
            "count": int(raw_ops.get(op, {}).get("count", 0)),
        }
        for op in model.OPERATIONS
    }
    return {
        "rating": row["rating"],
        "bins": json.loads(row["bins"]),
        "operations": operations,
    }
```

Replace `save_model_state` with:

```python
def save_model_state(conn: sqlite3.Connection, state: dict) -> None:
    conn.execute(
        "INSERT INTO model_state (id, rating, bins, operations, updated_at) "
        "VALUES (1, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, "
        "bins = excluded.bins, operations = excluded.operations, "
        "updated_at = excluded.updated_at",
        (state["rating"], json.dumps(state["bins"]),
         json.dumps(state["operations"]), _now()),
    )
    conn.commit()
```

- [ ] **Step 8: Run the full backend suite to verify it passes**

Run: `uv run pytest -q`
Expected: PASS — all backend tests green. (`test_api.py` still passes: the
API is unchanged and `model.weak_operations` still exists.)

- [ ] **Step 9: Commit**

```bash
git add src/mathtrainer/model.py src/mathtrainer/db.py src/mathtrainer/schema.sql tests/test_model.py tests/test_db.py
git commit -m "feat: per-operation Elo ratings in the model and storage"
git push
```

---

## Task 2: Backfill operation ratings from attempt history

When the `residuals` → `operations` rename happens on an existing database,
replay the attempt history once so users see real ratings immediately.

**Files:**
- Modify: `src/mathtrainer/model.py`
- Modify: `tests/test_model.py`
- Modify: `src/mathtrainer/db.py`
- Modify: `tests/test_db.py`

- [ ] **Step 1: Write the failing backfill tests in `tests/test_model.py`**

Append to `tests/test_model.py`:

```python
def test_backfill_operation_ratings_replays_history():
    attempts = [
        {"operation": "divide", "difficulty": 45.0,
         "is_correct": 0, "ms_to_submit": 9000}
        for _ in range(15)
    ]
    ops = model.backfill_operation_ratings(attempts)
    assert ops["divide"]["count"] == 15
    assert ops["divide"]["rating"] < model.DEFAULT_RATING
    assert ops["add"]["rating"] == model.DEFAULT_RATING


def test_backfill_operation_ratings_empty_history():
    ops = model.backfill_operation_ratings([])
    assert ops == model.default_model_state()["operations"]
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `uv run pytest tests/test_model.py -k backfill -q`
Expected: FAIL — `AttributeError: module 'mathtrainer.model' has no attribute 'backfill_operation_ratings'`.

- [ ] **Step 3: Implement `backfill_operation_ratings` in `src/mathtrainer/model.py`**

Append to `src/mathtrainer/model.py`:

```python
def backfill_operation_ratings(attempts: list[dict]) -> dict:
    """Replays a chronological list of attempt rows through the model to
    reconstruct per-operation ratings for a database that predates them.
    Each row needs: operation, difficulty, is_correct, ms_to_submit.
    Returns the `operations` map ({operation: {"rating", "count"}})."""
    state = default_model_state()
    for a in attempts:
        state, _ = process_attempt(
            state, a["operation"], float(a["difficulty"]),
            bool(a["is_correct"]), float(a["ms_to_submit"]),
        )
    return state["operations"]
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `uv run pytest tests/test_model.py -k backfill -q`
Expected: PASS — both backfill tests green.

- [ ] **Step 5: Write the failing migration-backfill test in `tests/test_db.py`**

Append to `tests/test_db.py`:

```python
def test_migration_backfills_operation_ratings_from_attempts(tmp_path):
    conn = _legacy_conn(tmp_path)
    conn.execute(
        "INSERT INTO model_state (id, rating, bins, residuals) "
        "VALUES (1, 50.0, '[]', '{}')"
    )
    conn.execute(
        "INSERT INTO sessions (mode, started_at) "
        "VALUES ('daily', '2026-05-01T10:00:00+00:00')"
    )
    for i in range(12):
        conn.execute(
            "INSERT INTO attempts (session_id, ts, operation, operands, "
            "correct_answer, given_answer, is_correct, difficulty, features, "
            "ms_to_submit) VALUES (1, ?, 'divide', '[12,3]', 4, 9, 0, 45.0, "
            "'{}', 9000)",
            (f"2026-05-01T10:{i:02d}:00+00:00",),
        )
    conn.commit()
    db._migrate(conn)
    state = db.load_model_state(conn)
    assert state["operations"]["divide"]["count"] == 12
    assert state["operations"]["divide"]["rating"] < 50.0
    assert state["operations"]["add"]["rating"] == 50.0
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `uv run pytest tests/test_db.py -k backfill -q`
Expected: FAIL — `divide` rating is still 50.0 (no backfill runs yet).

- [ ] **Step 7: Add the backfill to `_migrate` in `src/mathtrainer/db.py`**

In `src/mathtrainer/db.py`, change the `model_state` migration block inside
`_migrate` so it reads:

```python
    ms_cols = {r["name"] for r in conn.execute("PRAGMA table_info(model_state)")}
    if "residuals" in ms_cols and "operations" not in ms_cols:
        conn.execute(
            "ALTER TABLE model_state RENAME COLUMN residuals TO operations"
        )
        _backfill_operation_ratings(conn)
    conn.commit()
```

Add this helper function directly above `_migrate`:

```python
def _backfill_operation_ratings(conn: sqlite3.Connection) -> None:
    """One-time: reconstruct per-operation ratings from attempt history.
    Runs exactly once, immediately after the residuals->operations rename."""
    rows = conn.execute(
        "SELECT operation, difficulty, is_correct, ms_to_submit "
        "FROM attempts ORDER BY ts, id"
    ).fetchall()
    if not rows:
        return
    if conn.execute("SELECT 1 FROM model_state WHERE id = 1").fetchone() is None:
        return
    operations = model.backfill_operation_ratings([dict(r) for r in rows])
    conn.execute(
        "UPDATE model_state SET operations = ? WHERE id = 1",
        (json.dumps(operations),),
    )
```

- [ ] **Step 8: Run the full backend suite to verify it passes**

Run: `uv run pytest -q`
Expected: PASS — all backend tests green.

- [ ] **Step 9: Commit**

```bash
git add src/mathtrainer/model.py src/mathtrainer/db.py tests/test_model.py tests/test_db.py
git commit -m "feat: backfill per-operation ratings from attempt history on migration"
git push
```

---

## Task 3: API surface — session-plan and progress

`/api/session-plan` returns `operation_ratings` (replacing `weak_operations`);
`/api/progress` gains `operation_ratings`. The finish-session summary keeps its
`weak_operations` field unchanged.

**Files:**
- Modify: `src/mathtrainer/models.py`
- Modify: `src/mathtrainer/app.py`
- Modify: `tests/test_api.py`

- [ ] **Step 1: Update `tests/test_api.py`**

In `tests/test_api.py`, replace `test_session_plan_default_for_fresh_db` with:

```python
def test_session_plan_default_for_fresh_db(client):
    resp = client.get("/api/session-plan")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rating"] == 50.0
    assert body["target_band"]["min"] < body["target_band"]["max"]
    ratings = body["operation_ratings"]
    assert set(ratings) == {
        "add", "subtract", "multiply", "divide", "square", "percent",
    }
    assert ratings["add"] == 50.0
    assert body["session_length"] == 10
```

Append this new test:

```python
def test_progress_includes_operation_ratings(client):
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    ratings = resp.json()["operation_ratings"]
    assert set(ratings) == {
        "add", "subtract", "multiply", "divide", "square", "percent",
    }
    assert all(1.0 <= v <= 100.0 for v in ratings.values())
```

- [ ] **Step 2: Run the api tests to verify they fail**

Run: `uv run pytest tests/test_api.py -q`
Expected: FAIL — `KeyError: 'operation_ratings'`.

- [ ] **Step 3: Update `src/mathtrainer/models.py`**

In `src/mathtrainer/models.py`, replace the `SessionPlan` class with:

```python
class SessionPlan(BaseModel):
    rating: float
    target_band: DifficultyBandModel
    operation_ratings: dict[str, float]
    session_length: int
```

(Leave `SessionSummary` unchanged — it keeps its `weak_operations` field.)

- [ ] **Step 4: Update `src/mathtrainer/app.py`**

In `src/mathtrainer/app.py`, replace the `session_plan` function body's
`return` statement so the function reads:

```python
@app.get("/api/session-plan", response_model=SessionPlan)
def session_plan() -> SessionPlan:
    conn = _get_conn()
    try:
        state = db.load_model_state(conn) or model.default_model_state()
        band = model.target_band(state)
        return SessionPlan(
            rating=state["rating"],
            target_band={"min": band["min"], "max": band["max"]},
            operation_ratings=model.operation_ratings(state),
            session_length=db.load_settings(conn)["session_length"],
        )
    finally:
        conn.close()
```

Replace the `progress` function with:

```python
@app.get("/api/progress")
def progress() -> dict:
    conn = _get_conn()
    try:
        sessions = db.all_sessions(conn)
        attempts = db.all_attempts(conn)
        state = db.load_model_state(conn) or model.default_model_state()
        return {
            "history": stats.progress_series(sessions, attempts),
            "operation_times": stats.operation_times(attempts),
            "operation_ratings": model.operation_ratings(state),
        }
    finally:
        conn.close()
```

- [ ] **Step 5: Run the full backend suite to verify it passes**

Run: `uv run pytest -q`
Expected: PASS — all backend tests green.

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/models.py src/mathtrainer/app.py tests/test_api.py
git commit -m "feat: expose per-operation ratings via session-plan and progress APIs"
git push
```

---

## Task 4: Frontend contract and rating-weighted question generation

Switch the frontend off the `weakOperations` list and onto `operationRatings`.
The question generator builds a weighted operation pool so lower-rated
operations are sampled more often.

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/questionGenerator.ts`
- Modify: `frontend/src/lib/questionGenerator.test.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update `frontend/src/lib/questionGenerator.test.ts` — replace the weak-operations tests with rating-weighting tests**

In `frontend/src/lib/questionGenerator.test.ts`, change the import on line 4
to also import `Operation`:

```typescript
import type { DifficultyBand, Operation } from './types'
```

Delete the entire `describe('generateQuestion weak-operation weighting', ...)`
block (the two tests `over-samples weak operations` and `still works with an
empty weak-operations list`).

In the `describe('generateQuestion trick tagging', ...)` block, the first test
calls `generateQuestion({ min: 1, max: 100 }, Math.random, ['multiply'])`. The
third argument is now a ratings map, not an operation list — change that call to
oversample multiply via a low rating:

```typescript
      const q = generateQuestion({ min: 1, max: 100 }, Math.random, { multiply: 5 })
```

Append this new `describe` block to the file:

```typescript
describe('generateQuestion operation weighting', () => {
  it('over-samples operations with a low rating', () => {
    const ratings: Record<Operation, number> = {
      add: 5, subtract: 100, multiply: 100,
      divide: 100, square: 100, percent: 100,
    }
    const counts: Record<string, number> = {}
    for (let i = 0; i < 3000; i++) {
      const q = generateQuestion(BAND, Math.random, ratings)
      counts[q.operation] = (counts[q.operation] ?? 0) + 1
    }
    expect(counts.add).toBeGreaterThan((counts.subtract ?? 0) * 3)
  })

  it('still reaches every operation when ratings are equal', () => {
    const ratings: Record<Operation, number> = {
      add: 50, subtract: 50, multiply: 50,
      divide: 50, square: 50, percent: 50,
    }
    const seen = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      seen.add(generateQuestion(BAND, Math.random, ratings).operation)
    }
    expect(seen.size).toBe(6)
  })
})
```

- [ ] **Step 2: Run the generator tests to verify they fail**

Run (from `frontend/`): `npm test -- questionGenerator`
Expected: FAIL — the new `over-samples operations with a low rating` test
throws, because the old `generateQuestion` still spreads its third argument as
a list (`[...OPERATIONS, ...weakOps]`) and a ratings object is not iterable.

- [ ] **Step 3: Rewrite the operation pool in `frontend/src/lib/questionGenerator.ts`**

In `frontend/src/lib/questionGenerator.ts`, add this constant and helper
directly below the existing `OPERATIONS` declaration (after line 9):

```typescript
const DEFAULT_OP_RATING = 50

/**
 * Builds the operation pool, repeating each operation by a weight derived from
 * its rating: a weak op (rating ~30) appears ~3-4x as often as a strong op
 * (rating ~95), and every operation appears at least once.
 */
function weightedPool(
  operationRatings: Partial<Record<Operation, number>>,
): Operation[] {
  const pool: Operation[] = []
  for (const op of OPERATIONS) {
    const rating = operationRatings[op] ?? DEFAULT_OP_RATING
    const weight = Math.max(1, Math.round((105 - rating) / 10))
    for (let i = 0; i < weight; i++) pool.push(op)
  }
  return pool
}
```

Replace the `generateQuestion` function's signature and the `pool` line.
The function header and the first lines of its body become:

```typescript
/**
 * Generates a question whose difficulty falls inside `band`. Uses bounded
 * rejection sampling; if no candidate lands in the band within the retry
 * budget, returns the closest one found. The operation is drawn from a pool
 * weighted by `operationRatings` — lower-rated operations are over-sampled.
 * `rng` is injectable for testing.
 */
export function generateQuestion(
  band: DifficultyBand,
  rng: Rng = Math.random,
  operationRatings: Partial<Record<Operation, number>> = {},
): Question {
  const MAX_TRIES = 40
  const pool: Operation[] = weightedPool(operationRatings)
```

Leave the rest of the `generateQuestion` body (the `for` loop and return)
unchanged.

- [ ] **Step 4: Run the generator tests to verify they pass**

Run (from `frontend/`): `npm test -- questionGenerator`
Expected: PASS — all `questionGenerator` tests green (existing tests still
pass because the third argument defaults to `{}`).

- [ ] **Step 5: Update `frontend/src/lib/types.ts`**

In `frontend/src/lib/types.ts`, replace the `weakOperations` field of
`SessionPlan` so the interface reads:

```typescript
export interface SessionPlan {
  rating: number
  targetBand: DifficultyBand
  operationRatings: Record<Operation, number>
  sessionLength: number
}
```

Add an `operationRatings` field to `Progress`:

```typescript
export interface Progress {
  history: ProgressPoint[]
  operationTimes: OperationTime[]
  operationRatings: Record<Operation, number>
}
```

- [ ] **Step 6: Update `frontend/src/lib/api.ts`**

In `frontend/src/lib/api.ts`, in `getSessionPlan`, replace the `weakOperations`
line of the returned object so the return reads:

```typescript
  return {
    rating: raw.rating as number,
    targetBand: { min: raw.target_band.min, max: raw.target_band.max },
    operationRatings: raw.operation_ratings as Record<Operation, number>,
    sessionLength: raw.session_length as number,
  }
```

In `getProgress`, add `operationRatings` to the returned object so the return
reads:

```typescript
  return {
    history: r.history,
    operationTimes: r.operation_times.map(
      (o: { operation: string; avg_ms: number }) => ({
        operation: o.operation, avgMs: o.avg_ms,
      }),
    ),
    operationRatings: r.operation_ratings as Record<Operation, number>,
  }
```

- [ ] **Step 7: Update `frontend/src/App.tsx`**

In `frontend/src/App.tsx`, in `handleStart`, change the `source` closure so it
passes the operation ratings into the generator:

```typescript
      setPractice({
        source: () =>
          generateQuestion(plan.targetBand, Math.random, plan.operationRatings),
        total: plan.sessionLength,
        mode: 'daily',
      })
```

- [ ] **Step 8: Run the frontend test suite and type-check**

Run (from `frontend/`): `npm test`
Expected: PASS — all frontend tests green.

Run (from `frontend/`): `npm run build`
Expected: SUCCESS — `tsc -b` reports no type errors and the build completes.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/lib/questionGenerator.ts frontend/src/lib/questionGenerator.test.ts frontend/src/App.tsx
git commit -m "feat: weight question generation by per-operation rating"
git push
```

---

## Task 5: Progress page — ability-by-operation chart

Add an "Ability by operation" bar chart to the Progress page, one bar per
operation showing its rating on a 0–100 scale.

**Files:**
- Modify: `frontend/src/components/ProgressPage.tsx`

- [ ] **Step 1: Add the ability chart to `frontend/src/components/ProgressPage.tsx`**

In `frontend/src/components/ProgressPage.tsx`, change the type import on
line 6 to also import `Operation`:

```typescript
import type { Operation, Progress } from '../lib/types'
```

Add this constant directly below the imports (before the `Props` interface):

```typescript
const OP_ORDER: Operation[] = [
  'add', 'subtract', 'multiply', 'divide', 'square', 'percent',
]
```

Inside the `{data && data.history.length > 0 && ( ... )}` block, directly
after the closing `</ResponsiveContainer>` of the "Average time per operation"
chart and before the closing `</>`, add:

```tsx
          <h3>Ability by operation</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={OP_ORDER.map((op) => ({
                operation: op,
                rating: Math.round(data.operationRatings[op] ?? 50),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="operation" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="rating" fill="#239a3b" />
            </BarChart>
          </ResponsiveContainer>
```

- [ ] **Step 2: Type-check and build the frontend**

Run (from `frontend/`): `npm run build`
Expected: SUCCESS — `tsc -b` reports no type errors and the build completes.

- [ ] **Step 3: Run the frontend test suite**

Run (from `frontend/`): `npm test`
Expected: PASS — all frontend tests still green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ProgressPage.tsx
git commit -m "feat: show ability-by-operation chart on the Progress page"
git push
```

---

## Task 6: Full verification

Confirm the whole feature works end to end.

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `uv run pytest -q`
Expected: PASS — every backend test green.

- [ ] **Step 2: Run the full frontend suite and build**

Run (from `frontend/`): `npm test`
Expected: PASS — every frontend test green.

Run (from `frontend/`): `npm run build`
Expected: SUCCESS — no type errors, build completes.

- [ ] **Step 3: Manual check — run the app and inspect the feature**

Build the frontend (`npm run build` from `frontend/`), then start the backend:
`uv run uvicorn mathtrainer.app:app` from the repo root. Open the served URL.

Verify:
- The existing `mathtrainer.db` migrated cleanly (no startup error) — the
  `residuals` column is now `operations` and ratings were backfilled.
- Open **Progress** — the "Ability by operation" chart shows six bars, each
  in the 0–100 range.
- Complete a daily drill — it still records, and the operation you answer
  worst on trends downward across a few sessions.

- [ ] **Step 4: Final confirmation**

Report the suite results (backend pass count, frontend pass count, build
status) and confirm the manual check passed. The feature branch
`feat/operation-ratings` is ready to merge.
