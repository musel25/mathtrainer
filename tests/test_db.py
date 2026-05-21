import json
from mathtrainer import db, model


def _conn(tmp_path):
    conn = db.get_connection(tmp_path / "test.db")
    db.init_db(conn)
    return conn


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
        "SELECT operation, operands, is_correct, features FROM attempts "
        "WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    assert row["operation"] == "add"
    assert json.loads(row["operands"]) == [12, 34]
    assert row["is_correct"] == 1
    assert json.loads(row["features"]) == {"carries": 0, "maxOperand": 34}


def test_sessions_migration_adds_rating_columns(tmp_path):
    conn = _conn(tmp_path)
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(sessions)")}
    assert "rating_before" in cols
    assert "rating_after" in cols


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


def test_settings_defaults_and_save(tmp_path):
    conn = _conn(tmp_path)
    s = db.load_settings(conn)
    assert s == {"daily_goal": 20, "session_length": 10}

    db.save_settings(conn, {"daily_goal": 30, "session_length": 15})
    assert db.load_settings(conn) == {"daily_goal": 30, "session_length": 15}


def test_trick_state_record_and_read(tmp_path):
    conn = _conn(tmp_path)
    assert db.all_trick_state(conn) == []

    db.record_trick_attempt(conn, "times-11", is_correct=True)
    db.record_trick_attempt(conn, "times-11", is_correct=False)
    db.record_trick_attempt(conn, "times-9", is_correct=True)

    state = {t["slug"]: t for t in db.all_trick_state(conn)}
    assert state["times-11"]["attempts"] == 2
    assert state["times-11"]["correct"] == 1
    assert state["times-9"]["attempts"] == 1
    assert state["times-9"]["correct"] == 1
    assert state["times-11"]["last_practiced"] is not None


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
    state = db.load_model_state(conn)
    assert state is not None and set(state["operations"]) == set(model.OPERATIONS)
