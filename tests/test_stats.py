from datetime import date

from mathtrainer import stats


def _session(id, ended_date, n_questions, score, rating_after,
             started=None, mode="daily"):
    return {
        "id": id, "mode": mode,
        "started_at": (started or f"{ended_date}T12:00:00+00:00"),
        "ended_at": f"{ended_date}T12:05:00+00:00",
        "n_questions": n_questions, "total_score": score,
        "rating_before": rating_after - 1, "rating_after": rating_after,
    }


def test_daily_aggregates_groups_by_date():
    sessions = [
        _session(1, "2026-05-10", 10, 100.0, 51),
        _session(2, "2026-05-10", 10, 120.0, 52),
        _session(3, "2026-05-12", 10, 90.0, 53),
    ]
    daily = stats.daily_aggregates(sessions)
    assert daily["2026-05-10"]["questions"] == 20
    assert daily["2026-05-10"]["score"] == 220.0
    assert daily["2026-05-12"]["questions"] == 10


def test_streak_counts_consecutive_met_days():
    daily = {
        "2026-05-18": {"questions": 20, "score": 0.0},
        "2026-05-19": {"questions": 25, "score": 0.0},
        "2026-05-20": {"questions": 20, "score": 0.0},
    }
    assert stats.streak(daily, goal=20, today=date(2026, 5, 20)) == 3
    assert stats.streak(daily, goal=20, today=date(2026, 5, 22)) == 0


def test_streak_survives_an_unmet_today():
    daily = {
        "2026-05-18": {"questions": 20, "score": 0.0},
        "2026-05-19": {"questions": 20, "score": 0.0},
    }
    assert stats.streak(daily, goal=20, today=date(2026, 5, 20)) == 2


def test_heatmap_has_one_cell_per_day():
    daily = {"2026-05-20": {"questions": 10, "score": 75.0}}
    cells = stats.heatmap(daily, today=date(2026, 5, 20), days=14)
    assert len(cells) == 14
    assert cells[-1] == {"date": "2026-05-20", "score": 75.0, "questions": 10}
    assert cells[0]["score"] == 0.0


def test_progress_series_and_operation_times():
    sessions = [
        _session(1, "2026-05-10", 2, 100.0, 51),
        _session(2, "2026-05-11", 2, 130.0, 53),
    ]
    attempts = [
        {"session_id": 1, "operation": "add", "is_correct": 1, "ms_to_submit": 2000},
        {"session_id": 1, "operation": "add", "is_correct": 0, "ms_to_submit": 3000},
        {"session_id": 2, "operation": "multiply", "is_correct": 1, "ms_to_submit": 4000},
        {"session_id": 2, "operation": "multiply", "is_correct": 1, "ms_to_submit": 6000},
    ]
    series = stats.progress_series(sessions, attempts)
    assert [p["n"] for p in series] == [1, 2]
    assert series[0]["rating"] == 51
    assert series[0]["accuracy"] == 0.5
    assert series[1]["accuracy"] == 1.0

    op_times = {o["operation"]: o["avg_ms"] for o in stats.operation_times(attempts)}
    assert op_times["add"] == 2000.0
    assert op_times["multiply"] == 5000.0


def test_empty_inputs_return_empty_results():
    assert stats.daily_aggregates([]) == {}
    assert stats.streak({}, goal=10, today=date(2026, 5, 20)) == 0
    assert stats.progress_series([], []) == []
    assert stats.operation_times([]) == []
    assert stats.heatmap({}, today=date(2026, 5, 20), days=7) == [
        {"date": d, "score": 0.0, "questions": 0}
        for d in [
            "2026-05-14", "2026-05-15", "2026-05-16", "2026-05-17",
            "2026-05-18", "2026-05-19", "2026-05-20",
        ]
    ]


def test_daily_aggregates_excludes_learn_sessions():
    sessions = [
        _session(1, "2026-05-20", 10, 100.0, 51, mode="daily"),
        _session(2, "2026-05-20", 8, 80.0, 52, mode="learn"),
    ]
    daily = stats.daily_aggregates(sessions)
    # only the daily session's 10 questions count — not the learn session's 8
    assert daily["2026-05-20"]["questions"] == 10
