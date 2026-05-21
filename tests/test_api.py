import pytest
from fastapi.testclient import TestClient

from mathtrainer import app as app_module
from mathtrainer import db


@pytest.fixture
def client(tmp_path, monkeypatch):
    db_path = tmp_path / "api.db"
    conn = db.get_connection(db_path)
    db.init_db(conn)
    conn.close()
    monkeypatch.setattr(
        app_module, "_get_conn", lambda: db.get_connection(db_path)
    )
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
    assert body["total_score"] > 0
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
    resp = client.post(f"/api/sessions/{session_id}/finish", json=payload)
    assert resp.status_code == 200
    # the attempt's stored score must be the model-computed score, not 0
    assert resp.json()["total_score"] > 0


def test_finish_session_404_on_unknown_session(client):
    resp = client.post("/api/sessions/9999/finish", json={"attempts": []})
    assert resp.status_code == 404


def test_session_plan_default_for_fresh_db(client):
    resp = client.get("/api/session-plan")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rating"] == 50.0
    assert body["target_band"]["min"] < body["target_band"]["max"]
    ratings = body["operation_ratings"]
    assert set(ratings) == {
        "add", "subtract", "multiply", "divide", "square", "percent",
    }
    assert ratings["add"] == 50.0
    assert body["session_length"] == 10


def test_settings_get_and_put(client):
    resp = client.get("/api/settings")
    assert resp.status_code == 200
    assert resp.json() == {"daily_goal": 20, "session_length": 10}

    resp = client.put("/api/settings", json={"daily_goal": 25, "session_length": 12})
    assert resp.status_code == 200
    assert client.get("/api/settings").json() == {
        "daily_goal": 25, "session_length": 12,
    }


def _finish_a_session(client, n_correct, n_total, difficulty=45.0):
    sid = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    attempts = []
    for i in range(n_total):
        attempts.append({
            "operation": "add", "operands": [1, 2], "correct_answer": 3,
            "given_answer": 3 if i < n_correct else 9,
            "is_correct": i < n_correct, "difficulty": difficulty,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": None, "score": 0.0,
        })
    return client.post(f"/api/sessions/{sid}/finish", json={"attempts": attempts})


def test_dashboard_reports_streak_and_heatmap(client):
    _finish_a_session(client, 8, 10)
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    body = resp.json()
    assert body["today"]["questions"] == 10
    assert body["today"]["goal"] == 20
    assert body["total_sessions"] == 1
    assert isinstance(body["heatmap"], list) and len(body["heatmap"]) > 0
    assert "streak" in body and "rating" in body


def test_progress_reports_history(client):
    _finish_a_session(client, 9, 10)
    _finish_a_session(client, 7, 10)
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["history"]) == 2
    assert [p["n"] for p in body["history"]] == [1, 2]
    assert isinstance(body["operation_times"], list)
    op_ratings = body["operation_ratings"]
    assert set(op_ratings) == {
        "add", "subtract", "multiply", "divide", "square", "percent",
    }
    assert all(1.0 <= v <= 100.0 for v in op_ratings.values())


def test_tricks_endpoint_reports_proficiency(client):
    assert client.get("/api/tricks").json() == []

    sid = client.post("/api/sessions", json={"mode": "daily"}).json()["id"]
    attempts = [
        {
            "operation": "multiply", "operands": [35, 11], "correct_answer": 385,
            "given_answer": 385, "is_correct": True, "difficulty": 40.0,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": "times-11", "score": 0.0,
        },
        {
            "operation": "multiply", "operands": [42, 11], "correct_answer": 462,
            "given_answer": 99, "is_correct": False, "difficulty": 40.0,
            "features": {}, "ms_to_first_key": 400, "ms_to_submit": 1500,
            "trick_slug": "times-11", "score": 0.0,
        },
    ]
    client.post(f"/api/sessions/{sid}/finish", json={"attempts": attempts})

    tricks = {t["slug"]: t for t in client.get("/api/tricks").json()}
    assert tricks["times-11"]["attempts"] == 2
    assert tricks["times-11"]["correct"] == 1
    assert tricks["times-11"]["proficiency"] == 0.5


def test_progress_includes_operation_ratings(client):
    resp = client.get("/api/progress")
    assert resp.status_code == 200
    ratings = resp.json()["operation_ratings"]
    assert set(ratings) == {
        "add", "subtract", "multiply", "divide", "square", "percent",
    }
    assert all(1.0 <= v <= 100.0 for v in ratings.values())
