# mathtrainer Phase 1: Practice Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working local web app where the user runs a timed mental-arithmetic drill and every attempt is saved to a local SQLite database.

**Architecture:** A single FastAPI process serves the JSON API and the built React SPA. The drill runs entirely client-side (question generation, difficulty scoring, timing, local feedback) with zero network calls mid-session; attempts are buffered and POSTed as one batch when the session ends. Phase 1 uses a fixed difficulty band — the adaptive model arrives in Phase 2.

**Tech Stack:** Python 3.12 + FastAPI + uvicorn + stdlib `sqlite3`, managed by `uv`. React + Vite + TypeScript frontend, tested with Vitest. Backend tested with pytest.

**Scope note:** This is Phase 1 of the spec at `docs/superpowers/specs/2026-05-21-mathtrainer-design.md`. The adaptive personal model, progress graphs, habit tracking, and the trick library are Phases 2–4 and are explicitly out of scope here. Phase 1 stores all raw data those phases need.

---

## File Structure

```
mathtrainer/
  pyproject.toml                      # uv project, deps, console script
  .gitignore
  README.md
  src/mathtrainer/
    __init__.py
    schema.sql                        # SQLite DDL
    db.py                             # connection + data-access functions
    models.py                         # pydantic request/response models
    app.py                            # FastAPI app + routes + SPA mount
    cli.py                            # `mathtrainer` console entry point
  tests/
    test_db.py                        # pytest: data-access layer
    test_api.py                       # pytest: API endpoints
  frontend/
    package.json
    vite.config.ts                    # Vite + Vitest config
    index.html
    src/
      main.tsx
      App.tsx                         # screen routing via useState
      lib/
        types.ts                      # shared TS types
        difficulty.ts                 # pure: difficulty formula
        questionGenerator.ts          # pure: question generation
        session.ts                    # pure: session state machine
        api.ts                        # backend fetch wrappers
      lib/difficulty.test.ts
      lib/questionGenerator.test.ts
      lib/session.test.ts
      components/
        StartScreen.tsx
        PracticeScreen.tsx            # the timed loop
        SummaryScreen.tsx
  docs/superpowers/...                # spec + this plan (already committed)
```

**Responsibilities:** `db.py` is the only module that touches SQLite. `difficulty.ts`, `questionGenerator.ts`, and `session.ts` are pure, dependency-free, and fully unit-tested. React components are thin shells over those pure modules — they are verified manually because all testable logic lives outside them.

---

### Task 1: Project scaffold & GitHub repository

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `README.md`, `src/mathtrainer/__init__.py`, `frontend/` (Vite scaffold)

- [ ] **Step 1: Create the GitHub repository**

Use the GitHub MCP `create_repository` tool: name `mathtrainer`, description `Local single-user mental-math trainer with an adaptive personal difficulty model`, visibility public, do NOT auto-init (a local repo with the spec commit already exists).

- [ ] **Step 2: Wire the local repo to the remote and normalize the branch**

```bash
cd ~/Github/mathtrainer
git branch -M main
git remote add origin https://github.com/<your-username>/mathtrainer.git
git push -u origin main
```
Expected: the existing `docs: add mathtrainer design spec` commit appears on GitHub.

- [ ] **Step 3: Initialize the Python project with uv**

```bash
cd ~/Github/mathtrainer
uv init --package --python 3.12
```
This creates `pyproject.toml` and `src/mathtrainer/__init__.py`. If `uv init` reports the directory is not empty, that is fine — it only adds missing files.

- [ ] **Step 4: Add Python dependencies**

```bash
uv add fastapi "uvicorn[standard]" pydantic
uv add --dev pytest httpx
```
Expected: `pyproject.toml` lists the deps; `uv.lock` is created.

- [ ] **Step 5: Scaffold the frontend with Vite**

```bash
cd ~/Github/mathtrainer
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D vitest
```

- [ ] **Step 6: Configure Vitest**

Replace `frontend/vite.config.ts` with:

```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'node' },
})
```

In `frontend/package.json`, add to the `"scripts"` block:

```json
"test": "vitest run"
```

- [ ] **Step 7: Write `.gitignore`**

Create `~/Github/mathtrainer/.gitignore`:

```
__pycache__/
.venv/
.pytest_cache/
*.db
*.db-wal
*.db-shm
node_modules/
frontend/dist/
.DS_Store
```

- [ ] **Step 8: Write `README.md`**

Create `~/Github/mathtrainer/README.md`:

```markdown
# mathtrainer

A local, single-user mental-math trainer with an adaptive personal difficulty
model. Drill timed arithmetic, learn shortcuts, and track your progress — all
on your own machine, no accounts, no cloud.

See `docs/superpowers/specs/` for the design and `docs/superpowers/plans/` for
implementation plans.

## Run

```
uv run mathtrainer
```

Then open http://localhost:8000.

## Develop

- Backend tests: `uv run pytest`
- Frontend tests: `cd frontend && npm test`
- Frontend dev server (with API proxy): `cd frontend && npm run dev`
```

- [ ] **Step 9: Commit the scaffold to main**

```bash
cd ~/Github/mathtrainer
git add -A
git commit -m "chore: initial project setup"
git push
```

- [ ] **Step 10: Create the feature branch**

```bash
git checkout -b feat/phase-1-practice-loop
```
All remaining tasks commit on this branch; Task 11 merges it to main.

---

### Task 2: SQLite schema & data-access layer

**Files:**
- Create: `src/mathtrainer/schema.sql`, `src/mathtrainer/db.py`
- Test: `tests/test_db.py`

- [ ] **Step 1: Write the schema file**

Create `src/mathtrainer/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mode         TEXT    NOT NULL,
    started_at   TEXT    NOT NULL,
    ended_at     TEXT,
    n_questions  INTEGER NOT NULL DEFAULT 0,
    total_score  REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id       INTEGER NOT NULL REFERENCES sessions(id),
    ts               TEXT    NOT NULL,
    operation        TEXT    NOT NULL,
    operands         TEXT    NOT NULL,
    correct_answer   INTEGER NOT NULL,
    given_answer     INTEGER,
    is_correct       INTEGER NOT NULL,
    difficulty       REAL    NOT NULL,
    features         TEXT    NOT NULL,
    ms_to_first_key  INTEGER,
    ms_to_submit     INTEGER NOT NULL,
    trick_slug       TEXT,
    score            REAL    NOT NULL DEFAULT 0
);
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_db.py`:

```python
import json
from mathtrainer import db


def _conn(tmp_path):
    conn = db.get_connection(tmp_path / "test.db")
    db.init_db(conn)
    return conn


def test_create_and_finalize_session(tmp_path):
    conn = _conn(tmp_path)
    session_id = db.create_session(conn, mode="daily")
    assert isinstance(session_id, int)

    db.finalize_session(conn, session_id, n_questions=3, total_score=42.0)
    row = conn.execute(
        "SELECT mode, n_questions, total_score, ended_at FROM sessions WHERE id = ?",
        (session_id,),
    ).fetchone()
    assert row["mode"] == "daily"
    assert row["n_questions"] == 3
    assert row["total_score"] == 42.0
    assert row["ended_at"] is not None


def test_insert_attempts_batch(tmp_path):
    conn = _conn(tmp_path)
    session_id = db.create_session(conn, mode="daily")
    attempts = [
        {
            "operation": "add",
            "operands": [12, 34],
            "correct_answer": 46,
            "given_answer": 46,
            "is_correct": True,
            "difficulty": 21.0,
            "features": {"carries": 0, "maxOperand": 34},
            "ms_to_first_key": 800,
            "ms_to_submit": 1900,
            "trick_slug": None,
            "score": 21.0,
        }
    ]
    db.insert_attempts(conn, session_id, attempts)
    row = conn.execute(
        "SELECT operation, operands, is_correct, features FROM attempts"
    ).fetchone()
    assert row["operation"] == "add"
    assert json.loads(row["operands"]) == [12, 34]
    assert row["is_correct"] == 1
    assert json.loads(row["features"]) == {"carries": 0, "maxOperand": 34}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/test_db.py -v`
Expected: FAIL — `AttributeError: module 'mathtrainer.db' has no attribute 'get_connection'`.

- [ ] **Step 4: Implement `db.py`**

Create `src/mathtrainer/db.py`:

```python
"""SQLite data-access layer — the only module that touches the database."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_SCHEMA = Path(__file__).with_name("schema.sql")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(_SCHEMA.read_text())
    conn.commit()


def create_session(conn: sqlite3.Connection, mode: str) -> int:
    cur = conn.execute(
        "INSERT INTO sessions (mode, started_at) VALUES (?, ?)",
        (mode, _now()),
    )
    conn.commit()
    return int(cur.lastrowid)


def finalize_session(
    conn: sqlite3.Connection,
    session_id: int,
    n_questions: int,
    total_score: float,
) -> None:
    conn.execute(
        "UPDATE sessions SET ended_at = ?, n_questions = ?, total_score = ? "
        "WHERE id = ?",
        (_now(), n_questions, total_score, session_id),
    )
    conn.commit()


def insert_attempts(
    conn: sqlite3.Connection,
    session_id: int,
    attempts: list[dict],
) -> None:
    rows = [
        (
            session_id,
            _now(),
            a["operation"],
            json.dumps(a["operands"]),
            a["correct_answer"],
            a.get("given_answer"),
            1 if a["is_correct"] else 0,
            a["difficulty"],
            json.dumps(a["features"]),
            a.get("ms_to_first_key"),
            a["ms_to_submit"],
            a.get("trick_slug"),
            a.get("score", 0.0),
        )
        for a in attempts
    ]
    conn.executemany(
        "INSERT INTO attempts (session_id, ts, operation, operands, "
        "correct_answer, given_answer, is_correct, difficulty, features, "
        "ms_to_first_key, ms_to_submit, trick_slug, score) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/test_db.py -v`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/schema.sql src/mathtrainer/db.py tests/test_db.py
git commit -m "feat: add SQLite schema and data-access layer"
git push -u origin feat/phase-1-practice-loop
```

---

### Task 3: Pydantic models & session API endpoints

**Files:**
- Create: `src/mathtrainer/models.py`, `src/mathtrainer/app.py`
- Test: `tests/test_api.py`

- [ ] **Step 1: Write the pydantic models**

Create `src/mathtrainer/models.py`:

```python
"""Request/response models for the API."""
from __future__ import annotations

from pydantic import BaseModel


class AttemptIn(BaseModel):
    operation: str
    operands: list[int]
    correct_answer: int
    given_answer: int | None
    is_correct: bool
    difficulty: float
    features: dict
    ms_to_first_key: int | None
    ms_to_submit: int
    trick_slug: str | None = None
    score: float = 0.0


class SessionCreateIn(BaseModel):
    mode: str = "daily"


class SessionCreateOut(BaseModel):
    id: int


class SessionFinishIn(BaseModel):
    attempts: list[AttemptIn]


class SessionSummary(BaseModel):
    session_id: int
    n_questions: int
    n_correct: int
    accuracy: float
    total_score: float
```

- [ ] **Step 2: Write the failing test**

Create `tests/test_api.py`:

```python
import pytest
from fastapi.testclient import TestClient

from mathtrainer import app as app_module
from mathtrainer import db


@pytest.fixture
def client(tmp_path, monkeypatch):
    conn = db.get_connection(tmp_path / "api.db")
    db.init_db(conn)
    monkeypatch.setattr(app_module, "_get_conn", lambda: conn)
    return TestClient(app_module.app)


def test_create_session_returns_id(client):
    resp = client.post("/api/sessions", json={"mode": "daily"})
    assert resp.status_code == 200
    assert isinstance(resp.json()["id"], int)


def test_finish_session_persists_and_summarizes(client):
    session_id = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    payload = {
        "attempts": [
            {
                "operation": "add", "operands": [12, 34], "correct_answer": 46,
                "given_answer": 46, "is_correct": True, "difficulty": 21.0,
                "features": {"carries": 0}, "ms_to_first_key": 700,
                "ms_to_submit": 1800, "trick_slug": None, "score": 21.0,
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
    assert body["total_score"] == 21.0
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/test_api.py -v`
Expected: FAIL — `ImportError` / `module 'mathtrainer.app' has no attribute 'app'`.

- [ ] **Step 4: Implement `app.py` (API routes only — SPA mount added in Task 4)**

Create `src/mathtrainer/app.py`:

```python
"""FastAPI application: API routes and (in Task 4) the SPA mount."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException

from . import db
from .models import (
    SessionCreateIn,
    SessionCreateOut,
    SessionFinishIn,
    SessionSummary,
)

DB_PATH = os.environ.get("MATHTRAINER_DB", str(Path.cwd() / "mathtrainer.db"))

app = FastAPI(title="mathtrainer")


def _get_conn() -> sqlite3.Connection:
    """Overridden in tests. In production, opens the configured DB file."""
    conn = db.get_connection(DB_PATH)
    db.init_db(conn)
    return conn


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/sessions", response_model=SessionCreateOut)
def create_session(body: SessionCreateIn) -> SessionCreateOut:
    conn = _get_conn()
    session_id = db.create_session(conn, mode=body.mode)
    return SessionCreateOut(id=session_id)


@app.post("/api/sessions/{session_id}/finish", response_model=SessionSummary)
def finish_session(session_id: int, body: SessionFinishIn) -> SessionSummary:
    conn = _get_conn()
    exists = conn.execute(
        "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    if exists is None:
        raise HTTPException(status_code=404, detail="session not found")

    attempts = [a.model_dump() for a in body.attempts]
    db.insert_attempts(conn, session_id, attempts)

    n_questions = len(attempts)
    n_correct = sum(1 for a in attempts if a["is_correct"])
    total_score = sum(a["score"] for a in attempts)
    db.finalize_session(conn, session_id, n_questions, total_score)

    accuracy = (n_correct / n_questions) if n_questions else 0.0
    return SessionSummary(
        session_id=session_id,
        n_questions=n_questions,
        n_correct=n_correct,
        accuracy=accuracy,
        total_score=total_score,
    )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `uv run pytest tests/test_api.py -v`
Expected: PASS — both tests green.

- [ ] **Step 6: Commit**

```bash
git add src/mathtrainer/models.py src/mathtrainer/app.py tests/test_api.py
git commit -m "feat: add session create/finish API endpoints"
git push
```

---

### Task 4: Serve the SPA & the `mathtrainer` console command

**Files:**
- Modify: `src/mathtrainer/app.py` (add SPA static mount)
- Create: `src/mathtrainer/cli.py`
- Modify: `pyproject.toml` (console script entry point)

- [ ] **Step 1: Add the SPA mount to `app.py`**

At the end of `src/mathtrainer/app.py`, append:

```python
# --- Static SPA mount (must be last: it catches all non-/api routes) ---
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="spa")
```

This mounts the built frontend only when `frontend/dist` exists, so the API
tests in Task 3 keep working before the frontend is built.

- [ ] **Step 2: Write the CLI entry point**

Create `src/mathtrainer/cli.py`:

```python
"""`mathtrainer` console command: starts the server and opens the browser."""
from __future__ import annotations

import threading
import webbrowser

import uvicorn

HOST = "127.0.0.1"
PORT = 8000


def main() -> None:
    url = f"http://{HOST}:{PORT}"
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"mathtrainer running at {url}  (Ctrl+C to stop)")
    uvicorn.run("mathtrainer.app:app", host=HOST, port=PORT, log_level="warning")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Register the console script in `pyproject.toml`**

In `pyproject.toml`, ensure the `[project.scripts]` table reads exactly:

```toml
[project.scripts]
mathtrainer = "mathtrainer.cli:main"
```

(`uv init --package` creates this table pointing at a default function — replace
that line with the one above.)

- [ ] **Step 4: Verify the API still passes and the command resolves**

Run: `uv run pytest -v`
Expected: PASS — all four tests from Tasks 2–3 green.

Run: `uv run mathtrainer --help 2>/dev/null || uv run python -c "import mathtrainer.cli; print('cli import ok')"`
Expected: prints `cli import ok` (the server itself is verified end-to-end in Task 11).

- [ ] **Step 5: Commit**

```bash
git add src/mathtrainer/app.py src/mathtrainer/cli.py pyproject.toml
git commit -m "feat: serve built SPA and add mathtrainer console command"
git push
```

---

### Task 5: Frontend types & the difficulty formula

**Files:**
- Create: `frontend/src/lib/types.ts`, `frontend/src/lib/difficulty.ts`
- Test: `frontend/src/lib/difficulty.test.ts`

- [ ] **Step 1: Write the shared types**

Create `frontend/src/lib/types.ts`:

```typescript
export type Operation =
  | 'add' | 'subtract' | 'multiply' | 'divide' | 'square' | 'percent'

export interface QuestionFeatures {
  operation: Operation
  maxOperand: number
  carries: number
  trickSlug: string | null
}

export interface Question {
  operation: Operation
  operands: number[]
  prompt: string          // e.g. "12 + 34"
  answer: number
  features: QuestionFeatures
  difficulty: number      // 1..100
}

export interface DifficultyBand {
  min: number
  max: number
}

export interface QuestionResult {
  question: Question
  givenAnswer: number | null
  isCorrect: boolean
  msToFirstKey: number | null
  msToSubmit: number
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/lib/difficulty.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeDifficulty } from './difficulty'
import type { QuestionFeatures } from './types'

const base = (over: Partial<QuestionFeatures>): QuestionFeatures => ({
  operation: 'add', maxOperand: 10, carries: 0, trickSlug: null, ...over,
})

describe('computeDifficulty', () => {
  it('returns a value clamped to 1..100', () => {
    const d = computeDifficulty(base({ operation: 'add', maxOperand: 5 }))
    expect(d).toBeGreaterThanOrEqual(1)
    expect(d).toBeLessThanOrEqual(100)
  })

  it('rates multiplication harder than addition for the same operands', () => {
    const add = computeDifficulty(base({ operation: 'add', maxOperand: 50 }))
    const mul = computeDifficulty(base({ operation: 'multiply', maxOperand: 50 }))
    expect(mul).toBeGreaterThan(add)
  })

  it('rates larger operands harder', () => {
    const small = computeDifficulty(base({ maxOperand: 10 }))
    const large = computeDifficulty(base({ maxOperand: 900 }))
    expect(large).toBeGreaterThan(small)
  })

  it('adds difficulty for carries', () => {
    const none = computeDifficulty(base({ carries: 0 }))
    const some = computeDifficulty(base({ carries: 3 }))
    expect(some).toBeGreaterThan(none)
  })

  it('reduces difficulty when a trick applies', () => {
    const plain = computeDifficulty(base({ operation: 'multiply', trickSlug: null }))
    const trick = computeDifficulty(base({ operation: 'multiply', trickSlug: 'times-11' }))
    expect(trick).toBeLessThan(plain)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/difficulty.test.ts`
Expected: FAIL — cannot resolve `./difficulty`.

- [ ] **Step 4: Implement the difficulty formula**

Create `frontend/src/lib/difficulty.ts`:

```typescript
import type { Operation, QuestionFeatures } from './types'

const OP_BASE: Record<Operation, number> = {
  add: 8,
  subtract: 12,
  multiply: 20,
  divide: 24,
  square: 22,
  percent: 18,
}

/**
 * Hand-designed v1 difficulty formula. Pure function of question features.
 * Output is clamped to 1..100. See spec §3; Phase 5 may refit this from data.
 */
export function computeDifficulty(f: QuestionFeatures): number {
  const sizeTerm = 6 * Math.log2(f.maxOperand + 1)
  const carryTerm = 7 * f.carries
  const trickRelief = f.trickSlug ? -6 : 0
  const raw = OP_BASE[f.operation] + sizeTerm + carryTerm + trickRelief
  return Math.max(1, Math.min(100, Math.round(raw)))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/difficulty.test.ts`
Expected: PASS — all five tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/difficulty.ts frontend/src/lib/difficulty.test.ts
git commit -m "feat: add frontend types and difficulty formula"
git push
```

---

### Task 6: Question generator

**Files:**
- Create: `frontend/src/lib/questionGenerator.ts`
- Test: `frontend/src/lib/questionGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/questionGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { generateQuestion, countCarries } from './questionGenerator'
import type { DifficultyBand } from './types'

const BAND: DifficultyBand = { min: 15, max: 55 }

describe('countCarries', () => {
  it('counts zero carries for 12 + 34', () => {
    expect(countCarries(12, 34)).toBe(0)
  })
  it('counts a carry for 19 + 5', () => {
    expect(countCarries(19, 5)).toBe(1)
  })
})

describe('generateQuestion', () => {
  it('produces a question whose answer is correct for the operation', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      let expected: number
      switch (q.operation) {
        case 'add': expected = q.operands[0] + q.operands[1]; break
        case 'subtract': expected = q.operands[0] - q.operands[1]; break
        case 'multiply': expected = q.operands[0] * q.operands[1]; break
        case 'divide': expected = q.operands[0] / q.operands[1]; break
        case 'square': expected = q.operands[0] * q.operands[0]; break
        case 'percent': expected = (q.operands[0] / 100) * q.operands[1]; break
      }
      expect(q.answer).toBe(expected)
    }
  })

  it('always yields integer, non-negative answers', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      expect(Number.isInteger(q.answer)).toBe(true)
      expect(q.answer).toBeGreaterThanOrEqual(0)
    }
  })

  it('never produces a subtraction with a negative result', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      if (q.operation === 'subtract') {
        expect(q.operands[0]).toBeGreaterThanOrEqual(q.operands[1])
      }
    }
  })

  it('lands difficulty inside the band (allowing a small tolerance)', () => {
    for (let i = 0; i < 500; i++) {
      const q = generateQuestion(BAND)
      expect(q.difficulty).toBeGreaterThanOrEqual(BAND.min - 10)
      expect(q.difficulty).toBeLessThanOrEqual(BAND.max + 10)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`
Expected: FAIL — cannot resolve `./questionGenerator`.

- [ ] **Step 3: Implement the question generator**

Create `frontend/src/lib/questionGenerator.ts`:

```typescript
import type { DifficultyBand, Operation, Question } from './types'
import { computeDifficulty } from './difficulty'

type Rng = () => number

const OPERATIONS: Operation[] = [
  'add', 'subtract', 'multiply', 'divide', 'square', 'percent',
]

const SYMBOL: Record<Operation, string> = {
  add: '+', subtract: '−', multiply: '×', divide: '÷',
  square: '²', percent: '% of',
}

function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

/** Counts decimal carries when adding two non-negative integers. */
export function countCarries(a: number, b: number): number {
  let carry = 0
  let carries = 0
  while (a > 0 || b > 0) {
    const sum = (a % 10) + (b % 10) + carry
    if (sum >= 10) {
      carries++
      carry = 1
    } else {
      carry = 0
    }
    a = Math.floor(a / 10)
    b = Math.floor(b / 10)
  }
  return carries
}

/** Builds one raw question for the given operation. */
function buildRaw(rng: Rng, op: Operation): Omit<Question, 'difficulty'> {
  let operands: number[]
  let answer: number
  let prompt: string
  let carries = 0

  switch (op) {
    case 'add': {
      const a = randInt(rng, 2, 999)
      const b = randInt(rng, 2, 999)
      operands = [a, b]
      answer = a + b
      carries = countCarries(a, b)
      prompt = `${a} + ${b}`
      break
    }
    case 'subtract': {
      const a = randInt(rng, 2, 999)
      const b = randInt(rng, 2, a) // ensures non-negative result
      operands = [a, b]
      answer = a - b
      carries = countCarries(a - b, b) // borrows ≈ carries of the reverse add
      prompt = `${a} − ${b}`
      break
    }
    case 'multiply': {
      const a = randInt(rng, 2, 99)
      const b = randInt(rng, 2, 19)
      operands = [a, b]
      answer = a * b
      prompt = `${a} × ${b}`
      break
    }
    case 'divide': {
      // generate answer-first so division is always exact
      const quotient = randInt(rng, 2, 99)
      const divisor = randInt(rng, 2, 19)
      const dividend = quotient * divisor
      operands = [dividend, divisor]
      answer = quotient
      prompt = `${dividend} ÷ ${divisor}`
      break
    }
    case 'square': {
      const a = randInt(rng, 2, 40)
      operands = [a]
      answer = a * a
      prompt = `${a}²`
      break
    }
    case 'percent': {
      // pick a percentage and base that yield an integer result
      const pct = pick(rng, [5, 10, 20, 25, 50])
      const base = randInt(rng, 1, 20) * (100 / pct)
      operands = [pct, base]
      answer = (pct / 100) * base
      prompt = `${pct}% of ${base}`
      break
    }
  }

  return {
    operation: op,
    operands,
    prompt,
    answer,
    features: { operation: op, maxOperand: Math.max(...operands), carries, trickSlug: null },
  }
}

/**
 * Generates a question whose difficulty falls inside `band`. Uses bounded
 * rejection sampling; if no candidate lands in the band within the retry
 * budget, returns the closest one found. `rng` is injectable for testing.
 */
export function generateQuestion(
  band: DifficultyBand,
  rng: Rng = Math.random,
): Question {
  const MAX_TRIES = 40
  let best: Question | null = null
  let bestDist = Infinity

  for (let i = 0; i < MAX_TRIES; i++) {
    const raw = buildRaw(rng, pick(rng, OPERATIONS))
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

Note: `SYMBOL` is defined for use by later phases/components; the prompt strings
are built inline above so each operation reads clearly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/questionGenerator.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/questionGenerator.ts frontend/src/lib/questionGenerator.test.ts
git commit -m "feat: add question generator with integer-answer guarantees"
git push
```

---

### Task 7: Session state machine

**Files:**
- Create: `frontend/src/lib/session.ts`
- Test: `frontend/src/lib/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/session.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createSession, recordResult, isComplete, sessionStats, scoreResult } from './session'
import type { Question, QuestionResult } from './types'

const q = (difficulty: number): Question => ({
  operation: 'add', operands: [1, 2], prompt: '1 + 2', answer: 3,
  features: { operation: 'add', maxOperand: 2, carries: 0, trickSlug: null },
  difficulty,
})

const result = (difficulty: number, isCorrect: boolean): QuestionResult => ({
  question: q(difficulty), givenAnswer: isCorrect ? 3 : 9, isCorrect,
  msToFirstKey: 500, msToSubmit: 2000,
})

describe('session state machine', () => {
  it('starts empty and not complete', () => {
    const s = createSession(3)
    expect(s.results).toHaveLength(0)
    expect(isComplete(s)).toBe(false)
  })

  it('records results immutably', () => {
    const s0 = createSession(2)
    const s1 = recordResult(s0, result(20, true))
    expect(s0.results).toHaveLength(0)
    expect(s1.results).toHaveLength(1)
  })

  it('is complete once total results are recorded', () => {
    let s = createSession(2)
    s = recordResult(s, result(20, true))
    expect(isComplete(s)).toBe(false)
    s = recordResult(s, result(20, false))
    expect(isComplete(s)).toBe(true)
  })

  it('scores a correct answer as its difficulty and a wrong answer as 0', () => {
    expect(scoreResult(result(30, true))).toBe(30)
    expect(scoreResult(result(30, false))).toBe(0)
  })

  it('computes session stats', () => {
    let s = createSession(2)
    s = recordResult(s, result(30, true))
    s = recordResult(s, result(10, false))
    const stats = sessionStats(s)
    expect(stats.answered).toBe(2)
    expect(stats.correct).toBe(1)
    expect(stats.accuracy).toBe(0.5)
    expect(stats.totalScore).toBe(30)
    expect(stats.avgMsToSubmit).toBe(2000)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/session.test.ts`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Implement the session state machine**

Create `frontend/src/lib/session.ts`:

```typescript
import type { QuestionResult } from './types'

export interface SessionState {
  total: number
  results: QuestionResult[]
}

export interface SessionStats {
  answered: number
  correct: number
  accuracy: number
  totalScore: number
  avgMsToSubmit: number
}

export function createSession(total: number): SessionState {
  return { total, results: [] }
}

/** Phase 1 scoring: difficulty for a correct answer, 0 otherwise. */
export function scoreResult(result: QuestionResult): number {
  return result.isCorrect ? result.question.difficulty : 0
}

/** Returns a new state with `result` appended (does not mutate `state`). */
export function recordResult(
  state: SessionState,
  result: QuestionResult,
): SessionState {
  return { total: state.total, results: [...state.results, result] }
}

export function isComplete(state: SessionState): boolean {
  return state.results.length >= state.total
}

export function sessionStats(state: SessionState): SessionStats {
  const answered = state.results.length
  const correct = state.results.filter((r) => r.isCorrect).length
  const totalScore = state.results.reduce((sum, r) => sum + scoreResult(r), 0)
  const totalMs = state.results.reduce((sum, r) => sum + r.msToSubmit, 0)
  return {
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    totalScore,
    avgMsToSubmit: answered ? Math.round(totalMs / answered) : 0,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/session.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS — difficulty, questionGenerator, and session suites all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/session.ts frontend/src/lib/session.test.ts
git commit -m "feat: add session state machine and Phase 1 scoring"
git push
```

---

### Task 8: API client module

**Files:**
- Create: `frontend/src/lib/api.ts`

- [ ] **Step 1: Implement the API client**

Create `frontend/src/lib/api.ts`:

```typescript
import type { QuestionResult } from './types'

export interface SessionSummary {
  session_id: number
  n_questions: number
  n_correct: number
  accuracy: number
  total_score: number
}

interface AttemptPayload {
  operation: string
  operands: number[]
  correct_answer: number
  given_answer: number | null
  is_correct: boolean
  difficulty: number
  features: Record<string, unknown>
  ms_to_first_key: number | null
  ms_to_submit: number
  trick_slug: string | null
  score: number
}

function toPayload(r: QuestionResult): AttemptPayload {
  return {
    operation: r.question.operation,
    operands: r.question.operands,
    correct_answer: r.question.answer,
    given_answer: r.givenAnswer,
    is_correct: r.isCorrect,
    difficulty: r.question.difficulty,
    features: r.question.features as unknown as Record<string, unknown>,
    ms_to_first_key: r.msToFirstKey,
    ms_to_submit: r.msToSubmit,
    trick_slug: null,
    score: r.isCorrect ? r.question.difficulty : 0,
  }
}

export async function startSession(mode = 'daily'): Promise<number> {
  const resp = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  if (!resp.ok) throw new Error(`startSession failed: ${resp.status}`)
  return (await resp.json()).id as number
}

export async function finishSession(
  sessionId: number,
  results: QuestionResult[],
): Promise<SessionSummary> {
  const resp = await fetch(`/api/sessions/${sessionId}/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempts: results.map(toPayload) }),
  })
  if (!resp.ok) throw new Error(`finishSession failed: ${resp.status}`)
  return (await resp.json()) as SessionSummary
}
```

- [ ] **Step 2: Verify the frontend type-checks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add backend API client"
git push
```

---

### Task 9: React UI — Start, Practice, and Summary screens

**Files:**
- Create: `frontend/src/components/StartScreen.tsx`, `frontend/src/components/PracticeScreen.tsx`, `frontend/src/components/SummaryScreen.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx` (remove default Vite boilerplate)

The pure logic is tested in Tasks 5–7; these components are thin shells over it
and are verified manually in Task 11.

- [ ] **Step 1: Write `StartScreen.tsx`**

Create `frontend/src/components/StartScreen.tsx`:

```tsx
interface Props {
  onStart: () => void
}

export function StartScreen({ onStart }: Props) {
  return (
    <div style={{ textAlign: 'center', marginTop: '20vh' }}>
      <h1>mathtrainer</h1>
      <p>A 10-question mental-arithmetic drill.</p>
      <button onClick={onStart} style={{ fontSize: 20, padding: '12px 28px' }}>
        Start daily drill
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write `PracticeScreen.tsx`**

Create `frontend/src/components/PracticeScreen.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DifficultyBand, Question, QuestionResult } from '../lib/types'
import { generateQuestion } from '../lib/questionGenerator'
import {
  createSession, recordResult, isComplete, type SessionState,
} from '../lib/session'

const BAND: DifficultyBand = { min: 15, max: 55 } // fixed in Phase 1
const TOTAL = 10

interface Props {
  onComplete: (results: QuestionResult[]) => void
}

export function PracticeScreen({ onComplete }: Props) {
  const [session, setSession] = useState<SessionState>(() => createSession(TOTAL))
  const [question, setQuestion] = useState<Question>(() => generateQuestion(BAND))
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<null | 'correct' | string>(null)
  const [elapsed, setElapsed] = useState(0)
  const renderedAt = useRef(performance.now())
  const firstKeyAt = useRef<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const expectedLen = useMemo(() => String(question.answer).length, [question])

  // live timer
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(performance.now() - renderedAt.current),
      100,
    )
    return () => clearInterval(id)
  }, [question])

  // focus the input on every new question
  useEffect(() => {
    inputRef.current?.focus()
  }, [question])

  function nextQuestion(updated: SessionState) {
    if (isComplete(updated)) {
      onComplete(updated.results)
      return
    }
    setQuestion(generateQuestion(BAND))
    setInput('')
    setFeedback(null)
    firstKeyAt.current = null
    renderedAt.current = performance.now()
  }

  function submit(value: number) {
    const now = performance.now()
    const isCorrect = value === question.answer
    const result: QuestionResult = {
      question,
      givenAnswer: value,
      isCorrect,
      msToFirstKey: firstKeyAt.current
        ? Math.round(firstKeyAt.current - renderedAt.current)
        : null,
      msToSubmit: Math.round(now - renderedAt.current),
    }
    const updated = recordResult(session, result)
    setSession(updated)
    setFeedback(isCorrect ? 'correct' : `Answer: ${question.answer}`)
    // brief feedback pause, then advance
    setTimeout(() => nextQuestion(updated), isCorrect ? 350 : 1100)
  }

  function onChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '')
    if (digits && firstKeyAt.current === null) {
      firstKeyAt.current = performance.now()
    }
    setInput(digits)
    if (feedback === null && digits.length >= expectedLen) {
      submit(Number(digits))
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && feedback === null && input.length > 0) {
      submit(Number(input))
    }
  }

  const progress = `${session.results.length + 1} / ${TOTAL}`
  const seconds = (elapsed / 1000).toFixed(1)

  return (
    <div style={{ textAlign: 'center', marginTop: '14vh' }}>
      <div style={{ color: '#888' }}>{progress} &middot; {seconds}s</div>
      <div style={{ fontSize: 56, margin: '24px 0' }}>{question.prompt}</div>
      <input
        ref={inputRef}
        value={input}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={feedback !== null}
        style={{ fontSize: 40, width: 180, textAlign: 'center' }}
      />
      <div style={{ height: 40, marginTop: 16, fontSize: 24 }}>
        {feedback === 'correct' && <span style={{ color: 'green' }}>✓</span>}
        {feedback && feedback !== 'correct' && (
          <span style={{ color: 'crimson' }}>{feedback}</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write `SummaryScreen.tsx`**

Create `frontend/src/components/SummaryScreen.tsx`:

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
  return (
    <div style={{ textAlign: 'center', marginTop: '16vh' }}>
      <h2>Session complete</h2>
      <p>Accuracy: {(stats.accuracy * 100).toFixed(0)}%
        ({stats.correct}/{stats.answered})</p>
      <p>Average time: {(stats.avgMsToSubmit / 1000).toFixed(1)}s</p>
      <p>Score: {stats.totalScore.toFixed(0)}</p>
      {summary && <p style={{ color: '#888' }}>Saved (session #{summary.session_id}).</p>}
      {saveError && <p style={{ color: 'crimson' }}>Save failed: {saveError}</p>}
      <button onClick={onRestart} style={{ fontSize: 18, padding: '10px 24px' }}>
        Drill again
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite `App.tsx` to wire the screens together**

Replace the entire contents of `frontend/src/App.tsx`:

```tsx
import { useState } from 'react'
import type { QuestionResult } from './lib/types'
import { startSession, finishSession, type SessionSummary } from './lib/api'
import { StartScreen } from './components/StartScreen'
import { PracticeScreen } from './components/PracticeScreen'
import { SummaryScreen } from './components/SummaryScreen'

type Screen = 'start' | 'practice' | 'summary'

export default function App() {
  const [screen, setScreen] = useState<Screen>('start')
  const [results, setResults] = useState<QuestionResult[]>([])
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleComplete(finished: QuestionResult[]) {
    setResults(finished)
    setSummary(null)
    setSaveError(null)
    setScreen('summary')
    try {
      const sessionId = await startSession('daily')
      const result = await finishSession(sessionId, finished)
      setSummary(result)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    }
  }

  if (screen === 'start') {
    return <StartScreen onStart={() => setScreen('practice')} />
  }
  if (screen === 'practice') {
    return <PracticeScreen onComplete={handleComplete} />
  }
  return (
    <SummaryScreen
      results={results}
      summary={summary}
      saveError={saveError}
      onRestart={() => setScreen('start')}
    />
  )
}
```

- [ ] **Step 5: Clean `main.tsx` of Vite boilerplate**

Replace the entire contents of `frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Delete the now-unused files `frontend/src/App.css` and `frontend/src/index.css`
(and remove the `import './index.css'` line if `main.tsx` still references it —
the version above already omits it).

- [ ] **Step 6: Verify type-check and tests**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: no type errors; all pure-logic tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components frontend/src/App.tsx frontend/src/main.tsx
git rm --cached --ignore-unmatch frontend/src/App.css frontend/src/index.css
git commit -m "feat: add Start, Practice, and Summary screens"
git push
```

---

### Task 10: Build the frontend & verify the production bundle is served

**Files:**
- No source changes — this task builds the SPA and confirms FastAPI serves it.

- [ ] **Step 1: Build the frontend**

```bash
cd ~/Github/mathtrainer/frontend && npm run build
```
Expected: `frontend/dist/` is created with `index.html` and assets.

- [ ] **Step 2: Confirm `dist/` is git-ignored**

Run: `cd ~/Github/mathtrainer && git status --porcelain frontend/dist`
Expected: no output (the `.gitignore` from Task 1 excludes it).

- [ ] **Step 3: Verify FastAPI serves the SPA**

```bash
cd ~/Github/mathtrainer
MATHTRAINER_DB=/tmp/mt-verify.db uv run python -c "
from fastapi.testclient import TestClient
from mathtrainer.app import app
c = TestClient(app)
assert c.get('/api/health').json() == {'status': 'ok'}
r = c.get('/')
assert r.status_code == 200 and '<div id=\"root\">' in r.text
print('SPA served OK')
"
```
Expected: prints `SPA served OK`.

- [ ] **Step 4: Commit (build-script note only, if any)**

No commit needed if there were no source changes. If `package.json` or
`package-lock.json` changed during the build, commit them:

```bash
git add frontend/package.json frontend/package-lock.json 2>/dev/null
git commit -m "chore: lock frontend build dependencies" 2>/dev/null || true
git push
```

---

### Task 11: End-to-end manual verification & merge to main

**Files:**
- No source changes.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd ~/Github/mathtrainer && uv run pytest -v`
Expected: PASS — all 4 backend tests green.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd ~/Github/mathtrainer/frontend && npm test`
Expected: PASS — difficulty, questionGenerator, session suites all green.

- [ ] **Step 3: Launch the app and drill end-to-end**

```bash
cd ~/Github/mathtrainer && uv run mathtrainer
```
In the browser at `http://localhost:8000`:
- Click **Start daily drill**.
- Answer all 10 questions. Confirm: the question changes instantly on a correct
  answer; a wrong answer shows the correct answer briefly in red, then advances;
  the timer ticks; the input is auto-focused each question.
- On the summary screen, confirm accuracy, average time, score, and a
  `Saved (session #N)` line all appear.

Stop the server with Ctrl+C.

- [ ] **Step 4: Verify the data landed in SQLite**

```bash
cd ~/Github/mathtrainer
uv run python -c "
from mathtrainer import db
conn = db.get_connection('mathtrainer.db')
s = conn.execute('SELECT COUNT(*) c FROM sessions').fetchone()['c']
a = conn.execute('SELECT COUNT(*) c FROM attempts').fetchone()['c']
print(f'sessions={s} attempts={a}')
assert s >= 1 and a >= 10
print('persistence OK')
"
```
Expected: prints a non-zero count and `persistence OK`.

- [ ] **Step 5: Merge the feature branch to main and clean up**

```bash
cd ~/Github/mathtrainer
git checkout main
git merge --no-ff feat/phase-1-practice-loop -m "feat: Phase 1 — working practice loop with SQLite persistence"
git push origin main
git branch -d feat/phase-1-practice-loop
git push origin --delete feat/phase-1-practice-loop
```
Expected: `main` contains all Phase 1 work; the feature branch is gone locally
and remotely.

---

## Self-Review

**Spec coverage (against `2026-05-21-mathtrainer-design.md`):**
- §2 Architecture (FastAPI serves SPA, client-side hot path, batch POST at end) — Tasks 3, 4, 9.
- §3 Question generation (integer/non-negative answers, exact division, difficulty band, anti-repetition of trivial cases) — Task 6. *Exact in-session de-duplication of repeated questions is deferred to Phase 2's adaptive selector; Phase 1 excludes only trivial questions, which is acceptable for a 10-question fixed-band drill.*
- §3 Difficulty score — Task 5.
- §4 Timing & input model (two timestamps, auto-submit on digit length / Enter, no-retry wrong answers, keyboard-first) — Task 9 (`PracticeScreen`).
- §9 Data model — Tasks 2–3 implement the `sessions` and `attempts` tables; `model_state`, `trick_state`, and `settings` are Phases 2–4 per the phased scope.
- §10 Phase 1 deliverable ("the user can drill and attempts are saved") — verified in Task 11.
- §11 Testing (pytest for db/API, Vitest for pure frontend logic) — Tasks 2, 3, 5, 6, 7.
- §12 Stack & public GitHub repo — Task 1.
- Out of scope by design: the adaptive model (§5), tricks (§6), habit tracking (§7), the Dashboard/Progress/Tricks/Settings pages and the Sprint/Focus/Learn modes (§8), and the CSV export endpoint (§9) — all Phases 2–4.

**Placeholder scan:** No `TBD`/`TODO`/"handle edge cases" placeholders. Every code step contains complete, runnable code; every command lists its expected output.

**Type consistency:** `Question`, `QuestionFeatures`, `QuestionResult`, `DifficultyBand`, `Operation` are defined once in `types.ts` (Task 5) and used unchanged in Tasks 6, 7, 8, 9. `SessionState`/`SessionStats` are defined in `session.ts` (Task 7) and consumed in Task 9. The backend `AttemptIn` fields (Task 3) match the `AttemptPayload` keys produced by `api.ts` `toPayload` (Task 8): `operation, operands, correct_answer, given_answer, is_correct, difficulty, features, ms_to_first_key, ms_to_submit, trick_slug, score`. `db.insert_attempts` (Task 2) reads exactly those keys.
