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


def test_settings_defaults_and_save(tmp_path):
    conn = _conn(tmp_path)
    s = db.load_settings(conn)
    assert s == {"daily_goal": 20, "session_length": 10}

    db.save_settings(conn, {"daily_goal": 30, "session_length": 15})
    assert db.load_settings(conn) == {"daily_goal": 30, "session_length": 15}
