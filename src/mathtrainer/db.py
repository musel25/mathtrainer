"""SQLite data-access layer — the only module that touches the database."""
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import model

_log = logging.getLogger(__name__)

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


def _migrate(conn: sqlite3.Connection) -> None:
    """Idempotent schema migrations for databases created by older versions."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    if "rating_before" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_before REAL")
    if "rating_after" not in cols:
        conn.execute("ALTER TABLE sessions ADD COLUMN rating_after REAL")

    settings_cols = {r["name"] for r in conn.execute("PRAGMA table_info(settings)")}
    if settings_cols and "enabled_operations" not in settings_cols:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN enabled_operations TEXT NOT NULL "
            "DEFAULT '[\"add\",\"subtract\",\"multiply\",\"divide\"]'"
        )

    ms_cols = {r["name"] for r in conn.execute("PRAGMA table_info(model_state)")}
    if "residuals" in ms_cols and "operations" not in ms_cols:
        conn.execute(
            "ALTER TABLE model_state RENAME COLUMN residuals TO operations"
        )
        # The rename and the backfill UPDATE are committed together by the
        # conn.commit() below. If the backfill fails, the app must still start
        # — per-operation ratings fall back to defaults — so the failure is
        # caught and logged while conn.commit() still commits the rename.
        try:
            _backfill_operation_ratings(conn)
        except Exception:
            _log.warning(
                "operation-ratings backfill failed; ratings start at defaults",
                exc_info=True,
            )
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


_DEFAULT_SETTINGS = {
    "daily_goal": 20,
    "session_length": 10,
    "enabled_operations": list(model.DEFAULT_ENABLED_OPERATIONS),
}


def load_settings(conn: sqlite3.Connection) -> dict:
    row = conn.execute(
        "SELECT daily_goal, session_length, enabled_operations "
        "FROM settings WHERE id = 1"
    ).fetchone()
    if row is None:
        return {
            **_DEFAULT_SETTINGS,
            "enabled_operations": list(_DEFAULT_SETTINGS["enabled_operations"]),
        }
    return {
        "daily_goal": row["daily_goal"],
        "session_length": row["session_length"],
        "enabled_operations": json.loads(row["enabled_operations"]),
    }


def save_settings(conn: sqlite3.Connection, settings: dict) -> None:
    conn.execute(
        "INSERT INTO settings (id, daily_goal, session_length, enabled_operations) "
        "VALUES (1, ?, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET daily_goal = excluded.daily_goal, "
        "session_length = excluded.session_length, "
        "enabled_operations = excluded.enabled_operations",
        (
            settings["daily_goal"],
            settings["session_length"],
            json.dumps(settings["enabled_operations"]),
        ),
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


def record_trick_attempt(
    conn: sqlite3.Connection, slug: str, is_correct: bool
) -> None:
    conn.execute(
        "INSERT INTO trick_state (slug, attempts, correct, last_practiced) "
        "VALUES (?, 1, ?, ?) "
        "ON CONFLICT(slug) DO UPDATE SET attempts = attempts + 1, "
        "correct = correct + ?, last_practiced = ?",
        (slug, 1 if is_correct else 0, _now(), 1 if is_correct else 0, _now()),
    )
    conn.commit()


def all_trick_state(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT slug, attempts, correct, last_practiced FROM trick_state"
    ).fetchall()
    return [dict(r) for r in rows]
