"""FastAPI application: API routes and the static SPA mount."""
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
    try:
        session_id = db.create_session(conn, mode=body.mode)
        return SessionCreateOut(id=session_id)
    finally:
        conn.close()


@app.post("/api/sessions/{session_id}/finish", response_model=SessionSummary)
def finish_session(session_id: int, body: SessionFinishIn) -> SessionSummary:
    conn = _get_conn()
    try:
        if not db.session_exists(conn, session_id):
            raise HTTPException(status_code=404, detail="session not found")

        n_questions = len(body.attempts)
        n_correct = sum(1 for a in body.attempts if a.is_correct)
        total_score = sum(a.score for a in body.attempts)

        db.insert_attempts(
            conn, session_id, [a.model_dump() for a in body.attempts]
        )
        db.finalize_session(conn, session_id, n_questions, total_score)

        accuracy = (n_correct / n_questions) if n_questions else 0.0
        return SessionSummary(
            session_id=session_id,
            n_questions=n_questions,
            n_correct=n_correct,
            accuracy=accuracy,
            total_score=total_score,
        )
    finally:
        conn.close()


# --- Static SPA mount (must be last: it catches all non-/api routes) ---
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="spa")
