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
