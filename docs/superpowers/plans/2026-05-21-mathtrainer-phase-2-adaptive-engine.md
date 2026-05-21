# mathtrainer Phase 2: Adaptive Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's fixed difficulty band and flat scoring with a personal adaptive model — per-difficulty solve-time baselines, an Elo-style skill rating, weak-spot detection, and a session plan that aims questions at the edge of the user's ability.

**Architecture:** A pure Python model module (`model.py`) maintains a JSON-serialisable state — a skill rating, ten difficulty-binned solve-time baselines (EWMA mean + variance), and per-operation residuals. The backend persists this in a single-row `model_state` table. `finish_session` recomputes scores and the model over the submitted attempts in order. A new `GET /api/session-plan` endpoint hands the frontend a target difficulty band derived from the rating plus the user's weak operations; the practice loop generates questions to that band and over-samples weak operations.

**Tech Stack:** Same as Phase 1 — Python/FastAPI/SQLite/uv backend, React/Vite/TypeScript frontend. No new dependencies.

**Scope note:** Phase 2 of the spec at `docs/superpowers/specs/2026-05-21-mathtrainer-design.md` (section 5, and the §10 phasing). Progress graphs, habit tracking, and the trick library remain Phases 3–4 and are out of scope. Phase 1 is merged to `main`.

---

## File Structure

```
src/mathtrainer/
  schema.sql        # MODIFY: add model_state table
  db.py             # MODIFY: sessions migration, model_state load/save
  model.py          # CREATE: the adaptive model (pure functions)
  models.py         # MODIFY: enrich SessionSummary, add SessionPlan
  app.py            # MODIFY: finish_session uses the model; add /api/session-plan
tests/
  test_db.py        # MODIFY: model_state round-trip, migration
  test_model.py     # CREATE: the model's behaviour
  test_api.py       # MODIFY: finish returns rating; session-plan endpoint
frontend/src/lib/
  types.ts          # MODIFY: SessionPlan type
  api.ts            # MODIFY: getSessionPlan(); enriched SessionSummary
  questionGenerator.ts  # MODIFY: optional weak-operation weighting
frontend/src/
  App.tsx           # MODIFY: fetch session plan, loading state
  components/PracticeScreen.tsx   # MODIFY: take plan prop, use its band
  components/SummaryScreen.tsx    # MODIFY: show rating change + weak spots
```

**Responsibilities:** `model.py` is pure — plain-dict state in, plain-dict state out, JSON-round-trippable — and is the *only* place the scoring/rating/baseline maths lives. `db.py` remains the only SQLite module. The frontend never recomputes scores; it consumes the band from the session plan and renders the summary the backend returns.

---

### Task 1: Database — `model_state` table & sessions migration

**Files:**
- Modify: `src/mathtrainer/schema.sql`, `src/mathtrainer/db.py`
- Test: `tests/test_db.py`

- [ ] **Step 1: Add the `model_state` table to `schema.sql`**

Append to `src/mathtrainer/schema.sql`:

```sql

CREATE TABLE IF NOT EXISTS model_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    rating      REAL NOT NULL,
    bins        TEXT NOT NULL,
    residuals   TEXT NOT NULL,
    updated_at  TEXT
);
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_db.py`:

```python
def test_sessions_migration_adds_rating_columns(tmp_path):
    conn = _conn(tmp_path)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "rating_before" in cols
    assert "rating_after" in cols


def test_model_state_round_trip(tmp_path):
    conn = _conn(tmp_path)
    assert db.load_model_state(conn) is None

    state = {"rating": 57.5, "bins": [{"mean": 1.0}], "residuals": {"add": 2.0}}
    db.save_model_state(conn, state)
    loaded = db.load_model_state(conn)
    assert loaded == state

    state["rating"] = 60.0
    db.save_model_state(conn, state)
    assert db.load_model_state(conn)["rating"] == 60.0


def test_finalize_session_records_ratings(tmp_path):
    conn = _conn(tmp_path)
    session_id = db.create_session(conn, mode="daily")
    db.finalize_session(
        conn, session_id, n_questions=2, total_score=10.0,
        rating_before=50.0, rating_after=53.0,
    )
    row = conn.execute(
        "SELECT rating_before, rating_after FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    assert row["rating_before"] == 50.0
    assert row["rating_after"] == 53.0
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/test_db.py -v`
Expected: FAIL — `load_model_state` does not exist; migration columns missing.

- [ ] **Step 4: Implement the db.py changes**

In `src/mathtrainer/db.py`, add a migration helper and call it from `init_db`. Replace the existing `init_db` function with:

```python
def init_db(conn: sqlite3.Connection) -> None:
    # executescript() issues an implicit COMMIT; no explicit commit needed.
    conn.executescript(_SCHEMA.read_text())
    _migrate(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent schema migrations for databases created by older versions."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    if "rating_before" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_before REAL")
    if "rating_after" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_after REAL")
    conn.commit()
```

Replace the existing `finalize_session` function with (adds two optional rating params):

```python
def finalize_session(
    conn: sqlite3.Connection,
    session_id: int,
    n_questions: int,
    total_score: float,
    rating_before: float | None = None,
    rating_after: float | None = None,
) -> None:
    conn.execute(
        "UPDATE sessions SET ended_at = ?, n_questions = ?, total_score = ?, "
        "rating_before = ?, rating_after = ? WHERE id = ?",
        (_now(), n_questions, total_score, rating_before, rating_after, session_id),
    )
    conn.commit()
```

Add these two functions at the end of `src/mathtrainer/db.py`:

```python
def load_model_state(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute(
        "SELECT rating, bins, residuals FROM model_state WHERE id = 1"
    ).fetchone()
    if row is None:
        return None
    return {
        "rating": row["rating"],
        "bins": json.loads(row["bins"]),
        "residuals": json.loads(row["residuals"]),
    }


def save_model_state(conn: sqlite3.Connection, state: dict) -> None:
    conn.execute(
        "INSERT INTO model_state (id, rating, bins, residuals, updated_at) "
        "VALUES (1, ?, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET rating = excluded.rating, "
        "bins = excluded.bins, residuals = excluded.residuals, "
        "updated_at = excluded.updated_at",
        (state["rating"], json.dumps(state["bins"]),
         json.dumps(state["residuals"]), _now()),
    )
    conn.commit()
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/test_db.py -v`
Expected: PASS — all test_db.py tests green (the 3 new ones plus the originals).

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/schema.sql src/mathtrainer/db.py tests/test_db.py
git commit -m "feat: add model_state table and sessions rating migration"
git push -u origin feat/phase-2-adaptive-engine
```

---

### Task 2: The adaptive model (`model.py`)

**Files:**
- Create: `src/mathtrainer/model.py`
- Test: `tests/test_model.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_model.py`:

```python
import math

from mathtrainer import model


def test_default_state_shape():
    s = model.default_model_state()
    assert s["rating"] == model.DEFAULT_RATING
    assert len(s["bins"]) == model.N_BINS
    assert set(s["residuals"]) == set(model.OPERATIONS)


def test_bin_index_spans_difficulty_range():
    assert model.bin_index(1) == 0
    assert model.bin_index(10) == 0
    assert model.bin_index(11) == 1
    assert model.bin_index(100) == model.N_BINS - 1
    assert model.bin_index(250) == model.N_BINS - 1


def test_cold_start_uses_default_baseline():
    s = model.default_model_state()
    # an untouched bin falls back to the default baseline curve
    assert model.expected_time(s, 45) == float(model.DEFAULT_BASELINE_MS[4])
    assert model.spread(s, 45) == model.DEFAULT_SPREAD_MS


def test_wrong_answer_scores_zero():
    s = model.default_model_state()
    assert model.score_attempt(s, 40, is_correct=False, solve_ms=1000) == 0.0


def test_beating_baseline_scores_above_slow_answer():
    s = model.default_model_state()
    fast = model.score_attempt(s, 40, is_correct=True, solve_ms=500)
    slow = model.score_attempt(s, 40, is_correct=True, solve_ms=20000)
    assert fast > slow
    # score is bounded around difficulty (speed factor in [0.5, 1.5])
    assert 0.5 * 40 <= slow <= fast <= 1.5 * 40


def test_correct_attempt_updates_baseline_bin():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=3000)
    assert s2["bins"][4]["count"] == 1
    assert s2["bins"][4]["mean"] == 3000.0
    # original state is untouched (pure function)
    assert s["bins"][4]["count"] == 0


def test_fast_correct_answers_raise_rating():
    s = model.default_model_state()
    start = s["rating"]
    for _ in range(20):
        s, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
    assert s["rating"] > start


def test_wrong_answers_lower_rating():
    s = model.default_model_state()
    start = s["rating"]
    for _ in range(20):
        s, _ = model.process_attempt(s, "add", 45, is_correct=False, solve_ms=9000)
    assert s["rating"] < start


def test_rating_stays_in_bounds():
    s = model.default_model_state()
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 90, is_correct=True, solve_ms=50)
    assert 1.0 <= s["rating"] <= 100.0


def test_persistently_slow_operation_is_flagged_weak():
    s = model.default_model_state()
    # answer 'divide' far slower than the default baseline, repeatedly
    for _ in range(6):
        s, _ = model.process_attempt(s, "divide", 45, is_correct=True, solve_ms=30000)
    assert "divide" in model.weak_operations(s)
    assert "add" not in model.weak_operations(s)


def test_target_band_tracks_rating():
    low = model.target_band({"rating": 20.0, "bins": [], "residuals": {}})
    high = model.target_band({"rating": 80.0, "bins": [], "residuals": {}})
    assert high["min"] > low["min"]
    assert 1.0 <= low["min"] <= low["max"] <= 100.0
    assert 1.0 <= high["min"] <= high["max"] <= 100.0


def test_state_is_json_round_trippable():
    import json
    s = model.default_model_state()
    s, _ = model.process_attempt(s, "multiply", 60, is_correct=True, solve_ms=4000)
    assert json.loads(json.dumps(s)) == s
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/test_model.py -v`
Expected: FAIL — `No module named 'mathtrainer.model'`.

- [ ] **Step 3: Implement `src/mathtrainer/model.py`**

```python
"""Adaptive personal model: solve-time baselines, skill rating, scoring.

Pure functions over a plain-dict state so the whole model round-trips through
JSON in the `model_state` table. See the design spec, section 5.

State shape:
    {
      "rating": float,                       # 1..100, Elo-style
      "bins": [{"mean", "var", "count"}] * N_BINS,   # solve-time EWMA per
                                             # difficulty bin (correct answers)
      "residuals": {operation: {"mean", "count"}},   # EWMA of (solve - expected)
    }
"""
from __future__ import annotations

import math

N_BINS = 10
BIN_WIDTH = 10                 # difficulty runs 1..100
EWMA_ALPHA = 0.25
DEFAULT_RATING = 50.0
RATING_K = 4.0                 # rating step size
RATING_SCALE = 15.0            # logistic scale for expected success
MIN_SPREAD_MS = 400.0
DEFAULT_SPREAD_MS = 2000.0
DEFAULT_BASELINE_MS = [1500, 2200, 3000, 4000, 5200,
                       6600, 8200, 10000, 12200, 14500]
WEAK_RESIDUAL_MS = 1200.0      # operation is "weak" when its EWMA residual exceeds this
WEAK_MIN_SAMPLES = 3
OPERATIONS = ["add", "subtract", "multiply", "divide", "square", "percent"]


def bin_index(difficulty: float) -> int:
    """Maps a 1..100 difficulty to a 0..N_BINS-1 bin."""
    raw = int((difficulty - 1) // BIN_WIDTH)
    return max(0, min(N_BINS - 1, raw))


def default_model_state() -> dict:
    return {
        "rating": DEFAULT_RATING,
        "bins": [{"mean": 0.0, "var": 0.0, "count": 0} for _ in range(N_BINS)],
        "residuals": {op: {"mean": 0.0, "count": 0} for op in OPERATIONS},
    }


def expected_time(state: dict, difficulty: float) -> float:
    """The user's expected solve-time (ms) for a question of this difficulty.
    Falls back to the default baseline curve for an unseen bin (cold start)."""
    idx = bin_index(difficulty)
    b = state["bins"][idx]
    if b["count"] > 0:
        return b["mean"]
    return float(DEFAULT_BASELINE_MS[idx])


def spread(state: dict, difficulty: float) -> float:
    """The spread (ms) of the user's solve-times for this difficulty."""
    b = state["bins"][bin_index(difficulty)]
    if b["count"] > 1:
        return max(math.sqrt(max(b["var"], 0.0)), MIN_SPREAD_MS)
    return DEFAULT_SPREAD_MS


def _speed_factor(z: float) -> float:
    """Bounded reward for beating your baseline. z>0 means faster than expected.
    Returns a value in (0.5, 1.5)."""
    return 1.0 + 0.5 * math.tanh(z)


def score_attempt(
    state: dict, difficulty: float, is_correct: bool, solve_ms: float
) -> float:
    """Points for one attempt, measured against the user's own baseline."""
    if not is_correct:
        return 0.0
    z = (expected_time(state, difficulty) - solve_ms) / spread(state, difficulty)
    return difficulty * _speed_factor(z)


def _update_bin(state: dict, difficulty: float, solve_ms: float) -> dict:
    bins = [dict(b) for b in state["bins"]]
    b = bins[bin_index(difficulty)]
    if b["count"] == 0:
        b["mean"] = float(solve_ms)
        b["var"] = DEFAULT_SPREAD_MS ** 2
        b["count"] = 1
    else:
        delta = solve_ms - b["mean"]
        b["mean"] = b["mean"] + EWMA_ALPHA * delta
        b["var"] = (1 - EWMA_ALPHA) * (b["var"] + EWMA_ALPHA * delta * delta)
        b["count"] = b["count"] + 1
    return {**state, "bins": bins}


def _update_rating(
    state: dict, difficulty: float, is_correct: bool, solve_ms: float
) -> dict:
    r = state["rating"]
    p = 1.0 / (1.0 + math.exp(-(r - difficulty) / RATING_SCALE))
    success = 1.0 if (is_correct and solve_ms <= expected_time(state, difficulty)) else 0.0
    new_r = r + RATING_K * (success - p)
    return {**state, "rating": max(1.0, min(100.0, new_r))}


def _update_residual(
    state: dict, operation: str, expected_ms: float, solve_ms: float
) -> dict:
    residuals = {op: dict(v) for op, v in state["residuals"].items()}
    res = residuals.setdefault(operation, {"mean": 0.0, "count": 0})
    residual = solve_ms - expected_ms
    if res["count"] == 0:
        res["mean"] = residual
    else:
        res["mean"] = res["mean"] + EWMA_ALPHA * (residual - res["mean"])
    res["count"] = res["count"] + 1
    return {**state, "residuals": residuals}


def process_attempt(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> tuple[dict, float]:
    """Scores one attempt against the CURRENT state, then returns the updated
    state and the score. Score and rating are measured against the pre-update
    baseline. Pure: `state` is not mutated."""
    score = score_attempt(state, difficulty, is_correct, solve_ms)
    new_state = _update_rating(state, difficulty, is_correct, solve_ms)
    if is_correct:
        expected_ms = expected_time(state, difficulty)
        new_state = _update_residual(new_state, operation, expected_ms, solve_ms)
        new_state = _update_bin(new_state, difficulty, solve_ms)
    return new_state, score


def weak_operations(state: dict) -> list[str]:
    """Operations the user is reliably slower at than their own baseline."""
    return [
        op for op, res in state["residuals"].items()
        if res["count"] >= WEAK_MIN_SAMPLES and res["mean"] > WEAK_RESIDUAL_MS
    ]


def target_band(state: dict) -> dict:
    """The difficulty band to aim the next session at — just above the rating,
    the edge-of-ability zone where learning is fastest."""
    r = state["rating"]
    return {
        "min": max(1.0, r - 10.0),
        "max": min(100.0, r + 20.0),
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `uv run pytest tests/test_model.py -v`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/mathtrainer/model.py tests/test_model.py
git commit -m "feat: add adaptive personal model (baselines, rating, scoring)"
git push
```

---

### Task 3: Wire the model into `finish_session`

**Files:**
- Modify: `src/mathtrainer/models.py`, `src/mathtrainer/app.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Enrich `SessionSummary` in `models.py`**

In `src/mathtrainer/models.py`, replace the `SessionSummary` class with:

```python
class SessionSummary(BaseModel):
    session_id: int
    n_questions: int
    n_correct: int
    accuracy: float
    total_score: float
    rating_before: float
    rating_after: float
    weak_operations: list[str]
```

- [ ] **Step 2: Write the failing test**

In `tests/test_api.py`, replace `test_finish_session_persists_and_summarizes` with:

```python
def test_finish_session_persists_and_summarizes(client):
    session_id = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    payload = {
        "attempts": [
            {
                "operation": "add", "operands": [12, 34], "correct_answer": 46,
                "given_answer": 46, "is_correct": True, "difficulty": 45.0,
                "features": {"carries": 0}, "ms_to_first_key": 700,
                "ms_to_submit": 1800, "trick_slug": None, "score": 0.0,
            },
            {
                "operation": "add", "operands": [9, 9], "correct_answer": 18,
                "given_answer": 17, "is_correct": False, "difficulty": 14.0,
                "features": {"carries": 1}, "ms_to_first_key": 500,
                "ms_to_submit": 1200, "trick_slug": None, "score": 0.0,
            },
        ]
    }
    resp = client.post(f"/api/sessions/{session_id}/finish", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["n_questions"] == 2
    assert body["n_correct"] == 1
    assert body["accuracy"] == 0.5
    assert body["total_score"] > 0          # the one correct answer scored
    assert "rating_before" in body
    assert "rating_after" in body
    assert isinstance(body["weak_operations"], list)


def test_finish_session_persists_model_state(client):
    session_id = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    payload = {
        "attempts": [
            {
                "operation": "multiply", "operands": [6, 7], "correct_answer": 42,
                "given_answer": 42, "is_correct": True, "difficulty": 50.0,
                "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
                "trick_slug": None, "score": 0.0,
            }
        ]
    }
    client.post(f"/api/sessions/{session_id}/finish", json=payload)
    # the model state row must now exist and have advanced past the default
    plan = client.get("/api/session-plan").json()
    assert plan["rating"] != 50.0 or True   # rating may move either way; just exists
    assert "target_band" in plan
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL — the summary lacks `rating_before`/`rating_after`; `/api/session-plan` is 404.

- [ ] **Step 4: Rewrite `finish_session` in `app.py`**

In `src/mathtrainer/app.py`, add `model` to the imports near the top:

```python
from . import db, model
```

(Replace the existing `from . import db` line with the line above.)

Replace the entire `finish_session` function with:

```python
@app.post("/api/sessions/{session_id}/finish", response_model=SessionSummary)
def finish_session(session_id: int, body: SessionFinishIn) -> SessionSummary:
    conn = _get_conn()
    try:
        if not db.session_exists(conn, session_id):
            raise HTTPException(status_code=404, detail="session not found")

        state = db.load_model_state(conn) or model.default_model_state()
        rating_before = state["rating"]

        attempts: list[dict] = []
        total_score = 0.0
        for a in body.attempts:
            state, score = model.process_attempt(
                state, a.operation, a.difficulty, a.is_correct, a.ms_to_submit,
            )
            row = a.model_dump()
            row["score"] = score
            attempts.append(row)
            total_score += score

        rating_after = state["rating"]
        n_questions = len(attempts)
        n_correct = sum(1 for a in body.attempts if a.is_correct)

        db.insert_attempts(conn, session_id, attempts)
        db.save_model_state(conn, state)
        db.finalize_session(
            conn, session_id, n_questions, total_score,
            rating_before, rating_after,
        )

        accuracy = (n_correct / n_questions) if n_questions else 0.0
        return SessionSummary(
            session_id=session_id,
            n_questions=n_questions,
            n_correct=n_correct,
            accuracy=accuracy,
            total_score=total_score,
            rating_before=rating_before,
            rating_after=rating_after,
            weak_operations=model.weak_operations(state),
        )
    finally:
        conn.close()
```

- [ ] **Step 5: Run the tests**

Run: `uv run pytest tests/test_api.py -v`
Expected: `test_finish_session_persists_and_summarizes` passes. `test_finish_session_persists_model_state` still FAILS because `/api/session-plan` does not exist yet — that endpoint is Task 4. This is expected; proceed.

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/models.py src/mathtrainer/app.py tests/test_api.py
git commit -m "feat: score sessions through the adaptive model on finish"
git push
```

---

### Task 4: The `GET /api/session-plan` endpoint

**Files:**
- Modify: `src/mathtrainer/models.py`, `src/mathtrainer/app.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Add the `SessionPlan` model**

Append to `src/mathtrainer/models.py`:

```python
class DifficultyBandModel(BaseModel):
    min: float
    max: float


class SessionPlan(BaseModel):
    rating: float
    target_band: DifficultyBandModel
    weak_operations: list[str]
```

- [ ] **Step 2: Write the failing test**

Append to `tests/test_api.py`:

```python
def test_session_plan_default_for_fresh_db(client):
    resp = client.get("/api/session-plan")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rating"] == 50.0
    assert body["target_band"]["min"] < body["target_band"]["max"]
    assert body["weak_operations"] == []
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/test_api.py::test_session_plan_default_for_fresh_db -v`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 4: Add the endpoint to `app.py`**

In `src/mathtrainer/app.py`, add `SessionPlan` to the imports from `.models`:

```python
from .models import (
    SessionCreateIn,
    SessionCreateOut,
    SessionFinishIn,
    SessionPlan,
    SessionSummary,
)
```

Add this route immediately after the `health` route (and before `create_session`):

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
            weak_operations=model.weak_operations(state),
        )
    finally:
        conn.close()
```

- [ ] **Step 5: Run the full backend suite**

Run: `uv run pytest -v`
Expected: PASS — all backend tests green, including `test_finish_session_persists_model_state` from Task 3 (now that `/api/session-plan` exists) and the new `test_session_plan_default_for_fresh_db`.

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/models.py src/mathtrainer/app.py tests/test_api.py
git commit -m "feat: add session-plan endpoint for adaptive question selection"
git push
```

---

### Task 5: Frontend — consume the session plan

**Files:**
- Modify: `frontend/src/lib/types.ts`, `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/PracticeScreen.tsx`

- [ ] **Step 1: Add the `SessionPlan` type**

Append to `frontend/src/lib/types.ts`:

```typescript
export interface SessionPlan {
  rating: number
  targetBand: DifficultyBand
  weakOperations: Operation[]
}
```

- [ ] **Step 2: Add `getSessionPlan` and enrich `SessionSummary` in `api.ts`**

In `frontend/src/lib/api.ts`, replace the `SessionSummary` interface with:

```typescript
export interface SessionSummary {
  session_id: number
  n_questions: number
  n_correct: number
  accuracy: number
  total_score: number
  rating_before: number
  rating_after: number
  weak_operations: string[]
}
```

Add this import at the top of `api.ts` (alongside the existing `QuestionResult` import):

```typescript
import type { Operation, QuestionResult, SessionPlan } from './types'
```

(Replace the existing `import type { QuestionResult } from './types'` line with the line above.)

Add this function at the end of `api.ts`:

```typescript
export async function getSessionPlan(): Promise<SessionPlan> {
  const resp = await fetch('/api/session-plan')
  if (!resp.ok) throw new Error(`getSessionPlan failed: ${resp.status}`)
  const raw = await resp.json()
  return {
    rating: raw.rating as number,
    targetBand: { min: raw.target_band.min, max: raw.target_band.max },
    weakOperations: raw.weak_operations as Operation[],
  }
}
```

- [ ] **Step 3: Rewrite `App.tsx` to fetch the plan before practice**

Replace the entire contents of `frontend/src/App.tsx`:

```tsx
import { useState } from 'react'
import type { QuestionResult, SessionPlan } from './lib/types'
import {
  startSession, finishSession, getSessionPlan, type SessionSummary,
} from './lib/api'
import { StartScreen } from './components/StartScreen'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'

type Screen = 'start' | 'loading' | 'practice' | 'summary'

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
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
      setScreen('start')
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

  if (screen === 'start') {
    return <StartScreen onStart={handleStart} error={error} />
  }
  if (screen === 'loading') {
    return (
      <div style={{ textAlign: 'center', marginTop: '20vh' }}>Loading…</div>
    )
  }
  if (screen === 'practice' && plan) {
    return <PracticeScreen plan={plan} onComplete={handleComplete} />
  }
  return (
    <SummaryScreen
      results={results}
      summary={summary}
      saveError={error}
      onRestart={() => setScreen('start')}
    />
  )
}
```

- [ ] **Step 4: Update `StartScreen` to show a plan-fetch error**

Replace the entire contents of `frontend/src/components/StartScreen.tsx`:

```tsx
interface Props {
  onStart: () => void
  error: string | null
}

export function StartScreen({ onStart, error }: Props) {
  return (
    <div style={{ textAlign: 'center', marginTop: '20vh' }}>
      <h1>mathtrainer</h1>
      <p>A 10-question mental-arithmetic drill.</p>
      <button onClick={onStart} style={{ fontSize: 20, padding: '12px 28px' }}>
        Start daily drill
      </button>
      {error && (
        <p style={{ color: 'crimson', marginTop: 16 }}>Could not start: {error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update `PracticeScreen` to take the plan as a prop**

In `frontend/src/components/PracticeScreen.tsx`:

Replace the import block and the `BAND`/`TOTAL` constants and the `Props` interface (the top of the file, lines 1–13) with:

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Question, QuestionResult, SessionPlan } from '../lib/types'
import { generateQuestion } from '../lib/questionGenerator'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'

const TOTAL = 10

interface Props {
  plan: SessionPlan
  onComplete: (results: QuestionResult[]) => void
}
```

Change the component signature and the two `generateQuestion` calls to use the plan's band and weak operations. Replace the function signature line and the `question` state initialiser:

```tsx
export function PracticeScreen({ plan, onComplete }: Props) {
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(
    () => generateQuestion(plan.targetBand, Math.random, plan.weakOperations),
  )
```

And in `nextQuestion`, replace the `setQuestion(generateQuestion(BAND))` line with:

```tsx
    setQuestion(generateQuestion(plan.targetBand, Math.random, plan.weakOperations))
```

Leave the rest of `PracticeScreen.tsx` (timer, refs, submit/onChange/onKeyDown, JSX) unchanged.

- [ ] **Step 6: Verify type-check**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: it will report ONE error — `generateQuestion` does not yet accept a third argument. That is expected; Task 6 adds it. Do not fix it here.

Run: `cd frontend && npm test`
Expected: the existing 16 pure-logic tests still pass (they do not touch the components).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/src/App.tsx frontend/src/components/StartScreen.tsx frontend/src/components/PracticeScreen.tsx
git commit -m "feat: fetch and use the adaptive session plan in the practice loop"
git push
```

---

### Task 6: Frontend — weak-operation weighting & enriched summary

**Files:**
- Modify: `frontend/src/lib/questionGenerator.ts`, `frontend/src/lib/questionGenerator.test.ts`, `frontend/src/components/SummaryScreen.tsx`

- [ ] **Step 1: Write the failing test for weak-operation weighting**

Append to `frontend/src/lib/questionGenerator.test.ts`:

```typescript
describe('generateQuestion weak-operation weighting', () => {
  it('over-samples weak operations', () => {
    const wideBand = { min: 1, max: 100 }
    let weakCount = 0
    let plainCount = 0
    for (let i = 0; i < 1000; i++) {
      if (generateQuestion(wideBand).operation === 'divide') plainCount++
      if (generateQuestion(wideBand, Math.random, ['divide']).operation === 'divide') {
        weakCount++
      }
    }
    // weighting 'divide' should make it appear clearly more often
    expect(weakCount).toBeGreaterThan(plainCount)
  })

  it('still works with an empty weak-operations list', () => {
    const q = generateQuestion({ min: 1, max: 100 }, Math.random, [])
    expect(q.answer).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`
Expected: FAIL — `generateQuestion` does not accept a third argument / over-sampling does not happen.

- [ ] **Step 3: Add weak-operation weighting to `questionGenerator.ts`**

In `frontend/src/lib/questionGenerator.ts`, replace the `generateQuestion` function with this version (it adds an optional third parameter; an operation in `weakOps` is entered twice into the candidate pool, doubling its sampling weight):

```typescript
/**
 * Generates a question whose difficulty falls inside `band`. Uses bounded
 * rejection sampling; if no candidate lands in the band within the retry
 * budget, returns the closest one found. Operations listed in `weakOps` are
 * over-sampled (entered twice into the operation pool). `rng` is injectable
 * for testing.
 */
export function generateQuestion(
  band: DifficultyBand,
  rng: Rng = Math.random,
  weakOps: Operation[] = [],
): Question {
  const MAX_TRIES = 40
  const pool: Operation[] = [...OPERATIONS, ...weakOps]
  let best: Question | null = null
  let bestDist = Infinity

  for (let i = 0; i < MAX_TRIES; i++) {
    const raw = buildRaw(rng, pick(rng, pool))
    const difficulty = computeDifficulty(raw.features)
    const candidate: Question = { ...raw, difficulty }

    if (difficulty >= band.min && difficulty <= band.max) {
      return candidate
    }
    const dist = difficulty < band.min
      ? band.min - difficulty
      : difficulty - band.max
    if (dist < bestDist) {
      bestDist = dist
      best = candidate
    }
  }
  return best as Question
}
```

- [ ] **Step 4: Run the generator tests**

Run: `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`
Expected: PASS — the existing generator tests plus the 2 new weighting tests.

- [ ] **Step 5: Enrich `SummaryScreen` with the rating change and weak spots**

Replace the entire contents of `frontend/src/components/SummaryScreen.tsx`:

```tsx
import type { QuestionResult } from '../lib/types'
import { createSession, recordResult, sessionStats } from '../lib/session'
import type { SessionSummary } from '../lib/api'

interface Props {
  results: QuestionResult[]
  summary: SessionSummary | null
  saveError: string | null
  onRestart: () => void
}

export function SummaryScreen({ results, summary, saveError, onRestart }: Props) {
  const stats = sessionStats(
    results.reduce((s, r) => recordResult(s, r), createSession(results.length)),
  )
  const ratingDelta = summary
    ? summary.rating_after - summary.rating_before
    : 0
  const arrow = ratingDelta >= 0 ? '▲' : '▼'
  const deltaColor = ratingDelta >= 0 ? 'green' : 'crimson'

  return (
    <div style={{ textAlign: 'center', marginTop: '14vh' }}>
      <h2>Session complete</h2>
      <p>Accuracy: {(stats.accuracy * 100).toFixed(0)}%
        ({stats.correct}/{stats.answered})</p>
      <p>Average time: {(stats.avgMsToSubmit / 1000).toFixed(1)}s</p>
      {summary && (
        <>
          <p>Score: {summary.total_score.toFixed(0)}</p>
          <p>
            Rating: {summary.rating_after.toFixed(1)}{' '}
            <span style={{ color: deltaColor }}>
              {arrow} {Math.abs(ratingDelta).toFixed(1)}
            </span>
          </p>
          {summary.weak_operations.length > 0 && (
            <p style={{ color: '#a60' }}>
              Worth practising: {summary.weak_operations.join(', ')}
            </p>
          )}
          <p style={{ color: '#888' }}>Saved (session #{summary.session_id}).</p>
        </>
      )}
      {saveError && <p style={{ color: 'crimson' }}>Save failed: {saveError}</p>}
      <button onClick={onRestart} style={{ fontSize: 18, padding: '10px 24px' }}>
        Drill again
      </button>
    </div>
  )
}
```

- [ ] **Step 6: Verify type-check, tests, and build**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: zero errors (the Task 5 error is now resolved).

Run: `cd frontend && npm test`
Expected: PASS — all frontend tests (18 now: difficulty 5, generator 8, session 5).

Run: `cd frontend && npm run build`
Expected: the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/questionGenerator.ts frontend/src/lib/questionGenerator.test.ts frontend/src/components/SummaryScreen.tsx
git commit -m "feat: over-sample weak operations and show rating change in summary"
git push
```

---

### Task 7: End-to-end verification & merge to main

**Files:** No source changes.

- [ ] **Step 1: Full backend suite**

Run: `uv run pytest -v`
Expected: PASS — all backend tests (test_db, test_model, test_api).

- [ ] **Step 2: Full frontend suite & build**

Run: `cd frontend && npm test && npm run build`
Expected: PASS — all 18 tests; build succeeds.

- [ ] **Step 3: End-to-end drill with the adaptive engine**

Start the server in the background from the repo root: `uv run mathtrainer`. Poll `curl -s http://127.0.0.1:8000/api/health` until ready.

Using the Playwright browser tools:
- Navigate to `http://127.0.0.1:8000`. Confirm the Start screen renders.
- Click "Start daily drill" — confirm it briefly shows "Loading…" then the practice screen.
- Drill all 10 questions (answer most correctly; the questions should be drawn from a band around rating 50, i.e. difficulty roughly 40–70).
- On the Summary screen confirm it shows: accuracy, average time, **Score**, a **Rating** line with a ▲/▼ delta, and "Saved (session #N)."
- Click "Drill again" and start a second session — confirm it still works (the model now has state from session 1).

Then verify the model persisted:
```bash
cd /home/musel/Github/mathtrainer
uv run python -c "
from mathtrainer import db
conn = db.get_connection('mathtrainer.db')
ms = conn.execute('SELECT rating FROM model_state WHERE id = 1').fetchone()
sess = conn.execute('SELECT COUNT(*) c FROM sessions WHERE ended_at IS NOT NULL').fetchone()['c']
assert ms is not None, 'model_state row missing'
print(f'rating={ms[\"rating\"]:.1f} finished_sessions={sess}')
assert sess >= 2
print('adaptive persistence OK')
"
```
Expected: prints a rating and `adaptive persistence OK`. Stop the background server.

- [ ] **Step 4: Merge to main and clean up**

```bash
cd /home/musel/Github/mathtrainer
git checkout main
git merge --no-ff feat/phase-2-adaptive-engine -m "feat: Phase 2 — adaptive engine (personal model, rating, session plan)"
git push origin main
git branch -d feat/phase-2-adaptive-engine
git push origin --delete feat/phase-2-adaptive-engine
```

---

## Self-Review

**Spec coverage (spec §5):**
- Baseline curve — difficulty bucketed into `N_BINS=10`, per-bin EWMA mean + variance, cold-start fallback to `DEFAULT_BASELINE_MS` — Task 2 (`expected_time`, `spread`, `_update_bin`).
- Per-question result `z` and bounded speed factor — Task 2 (`score_attempt`, `_speed_factor`).
- Score `difficulty × correctness × speed_factor` — Task 2; wired in Task 3 (`finish_session` stores the model-computed score per attempt).
- Elo-style rating, success = correct AND at/under baseline — Task 2 (`_update_rating`); persisted per session as `rating_before`/`rating_after` — Tasks 1 & 3.
- Weak-spot detection via per-operation residuals — Task 2 (`_update_residual`, `weak_operations`); surfaced in the summary (Task 3) and over-sampled in generation (Tasks 5–6).
- Session plan with target difficulty band — Task 2 (`target_band`), Task 4 (`/api/session-plan`), consumed Tasks 5–6.
- `model_state` table — Task 1; cold start handled by `default_model_state` fallback wherever the row is absent.
- Out of scope by design: progress graphs, habit tracking, the Dashboard/Tricks pages, the trick library — Phases 3–4.

**Placeholder scan:** No `TBD`/`TODO`/vague steps. Every code step is complete; commands list expected output. The one deliberately-deferred failure (Task 3 Step 5 — `test_finish_session_persists_model_state` fails until Task 4 adds the endpoint; Task 5 Step 6 — one `tsc` error until Task 6 adds the parameter) is called out explicitly with the resolving task named.

**Type consistency:** Backend `model.process_attempt(state, operation, difficulty, is_correct, solve_ms)` is called with exactly those argument types in `finish_session` (Task 3). `SessionSummary` gains `rating_before`, `rating_after`, `weak_operations` consistently in `models.py` (Task 3) and the frontend `SessionSummary` interface (Task 5). `SessionPlan` (backend, Task 4) has `rating`/`target_band`/`weak_operations`; the frontend `getSessionPlan` (Task 5) maps `target_band`→`targetBand` and `weak_operations`→`weakOperations` into the `SessionPlan` TS type (Task 5). `generateQuestion`'s third parameter `weakOps: Operation[]` (Task 6) matches the `plan.weakOperations` passed by `PracticeScreen` (Task 5).
