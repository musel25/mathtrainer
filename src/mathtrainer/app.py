"""FastAPI application: API routes and the static SPA mount."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException

from . import db, model
from .models import (
    SessionCreateIn,
    SessionCreateOut,
    SessionFinishIn,
    SessionPlan,
    SessionSummary,
    SettingsModel,
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


# --- Static SPA mount (must be last: it catches all non-/api routes) ---
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="spa")
