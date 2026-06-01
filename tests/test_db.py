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
    assert s == {
        "daily_goal": 20,
        "session_length": 10,
        "enabled_operations": ["add", "subtract", "multiply", "divide"],
    }

    db.save_settings(conn, {
        "daily_goal": 30,
        "session_length": 15,
        "enabled_operations": ["add", "multiply", "percent"],
    })
    assert db.load_settings(conn) == {
        "daily_goal": 30,
        "session_length": 15,
        "enabled_operations": ["add", "multiply", "percent"],
    }


def test_settings_migration_adds_enabled_operations(tmp_path):
    """A settings table from before the column existed picks up the default."""
    conn = db.get_connection(tmp_path / "legacy_settings.db")
    conn.executescript(
        "CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), "
        "daily_goal INTEGER NOT NULL DEFAULT 20, "
        "session_length INTEGER NOT NULL DEFAULT 10);"
        "INSERT INTO settings (id, daily_goal, session_length) VALUES (1, 22, 11);"
    )
    conn.commit()
    db.init_db(conn)
    assert db.load_settings(conn) == {
        "daily_goal": 22,
        "session_length": 11,
        "enabled_operations": ["add", "subtract", "multiply", "divide"],
    }


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


def test_migration_skips_backfill_when_no_model_state_row(tmp_path):
    conn = _legacy_conn(tmp_path)
    # legacy DB with attempts but no model_state row
    conn.execute(
        "INSERT INTO sessions (mode, started_at) "
        "VALUES ('daily', '2026-05-01T10:00:00+00:00')"
    )
    conn.execute(
        "INSERT INTO attempts (session_id, ts, operation, operands, "
        "correct_answer, given_answer, is_correct, difficulty, features, "
        "ms_to_submit) VALUES (1, '2026-05-01T10:00:00+00:00', 'add', "
        "'[1,2]', 3, 3, 1, 20.0, '{}', 1200)"
    )
    conn.commit()
    db._migrate(conn)  # must not raise
    assert conn.execute("SELECT COUNT(*) FROM model_state").fetchone()[0] == 0
