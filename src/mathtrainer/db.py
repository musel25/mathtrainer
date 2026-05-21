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
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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


def create_session(conn: sqlite3.Connection, mode: str) -> int:
    cur = conn.execute(
        "INSERT INTO sessions (mode, started_at) VALUES (?, ?)",
        (mode, _now()),
    )
    conn.commit()
    return int(cur.lastrowid)


def session_exists(conn: sqlite3.Connection, session_id: int) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return row is not None


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
