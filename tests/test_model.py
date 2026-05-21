import math

from mathtrainer import model


def test_default_state_shape():
    s = model.default_model_state()
    assert s["rating"] == model.DEFAULT_RATING
    assert len(s["bins"]) == model.N_BINS
    assert set(s["operations"]) == set(model.OPERATIONS)


def test_bin_index_spans_difficulty_range():
    assert model.bin_index(1) == 0
    assert model.bin_index(10) == 0
    assert model.bin_index(11) == 1
    assert model.bin_index(100) == model.N_BINS - 1
    assert model.bin_index(250) == model.N_BINS - 1


def test_cold_start_uses_default_baseline():
    s = model.default_model_state()
    assert model.expected_time(s, 45) == float(model.DEFAULT_BASELINE_MS[4])
    assert model.spread(s, 45) == model.DEFAULT_SPREAD_MS


def test_wrong_answer_scores_zero():
    s = model.default_model_state()
    assert model.score_attempt(s, 40, is_correct=False, solve_ms=1000) == 0.0


def test_beating_baseline_scores_above_slow_answer():
    s = model.default_model_state()
    fast = model.score_attempt(s, 40, is_correct=True, solve_ms=500)
    slow = model.score_attempt(s, 40, is_correct=True, solve_ms=20000)
    assert fast > slow
    assert 0.5 * 40 <= slow <= fast <= 1.5 * 40


def test_correct_attempt_updates_baseline_bin():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=3000)
    assert s2["bins"][4]["count"] == 1
    assert s2["bins"][4]["mean"] == 3000.0
    assert s["bins"][4]["count"] == 0


def test_fast_correct_answers_raise_rating():
    s = model.default_model_state()
    start = s["rating"]
    for _ in range(20):
        s, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
    assert s["rating"] > start


def test_wrong_answers_lower_rating():
    s = model.default_model_state()
    start = s["rating"]
    for _ in range(20):
        s, _ = model.process_attempt(s, "add", 45, is_correct=False, solve_ms=9000)
    assert s["rating"] < start


def test_rating_stays_in_bounds():
    s = model.default_model_state()
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 90, is_correct=True, solve_ms=50)
    assert 1.0 <= s["rating"] <= 100.0


def test_target_band_tracks_rating():
    low = model.target_band({"rating": 20.0, "bins": [], "operations": {}})
    high = model.target_band({"rating": 80.0, "bins": [], "operations": {}})
    assert high["min"] > low["min"]
    assert 1.0 <= low["min"] <= low["max"] <= 100.0
    assert 1.0 <= high["min"] <= high["max"] <= 100.0


def test_state_is_json_round_trippable():
    import json
    s = model.default_model_state()
    s, _ = model.process_attempt(s, "multiply", 60, is_correct=True, solve_ms=4000)
    assert json.loads(json.dumps(s)) == s


def test_score_at_spread_floor_is_well_behaved():
    s = model.default_model_state()
    for _ in range(100):
        s, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=5200)
    assert model.spread(s, 45) == model.MIN_SPREAD_MS
    score = model.score_attempt(s, 45, is_correct=True, solve_ms=4800)
    assert 0.5 * 45 <= score <= 1.5 * 45
    assert not math.isnan(score)


def test_operations_seeded_at_default_rating():
    s = model.default_model_state()
    assert set(s["operations"]) == set(model.OPERATIONS)
    for rec in s["operations"].values():
        assert rec["rating"] == model.DEFAULT_RATING
        assert rec["count"] == 0


def test_fast_correct_answers_raise_operation_rating():
    s = model.default_model_state()
    for _ in range(20):
        s, _ = model.process_attempt(s, "multiply", 45, is_correct=True, solve_ms=200)
    assert s["operations"]["multiply"]["rating"] > model.DEFAULT_RATING


def test_wrong_answer_updates_op_rating_but_not_bins():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=False, solve_ms=500)
    assert s2["bins"][4]["count"] == 0
    assert s2["operations"]["add"]["count"] == 1
    assert s2["operations"]["add"]["rating"] < model.DEFAULT_RATING


def test_process_attempt_only_updates_the_target_operation():
    s = model.default_model_state()
    s2, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
    assert s2["operations"]["add"]["count"] == 1
    assert s2["operations"]["subtract"] == {"rating": model.DEFAULT_RATING, "count": 0}


def test_operation_rating_stays_in_bounds():
    s = model.default_model_state()
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 90, is_correct=True, solve_ms=50)
    for _ in range(500):
        s, _ = model.process_attempt(s, "add", 10, is_correct=False, solve_ms=9000)
    assert 1.0 <= s["operations"]["add"]["rating"] <= 100.0


def test_operation_ratings_accessor_returns_all_operations():
    s = model.default_model_state()
    ratings = model.operation_ratings(s)
    assert set(ratings) == set(model.OPERATIONS)
    assert ratings["add"] == model.DEFAULT_RATING


def test_low_rated_operation_is_flagged_weak():
    s = model.default_model_state()
    for _ in range(30):
        s, _ = model.process_attempt(s, "add", 45, is_correct=True, solve_ms=200)
        s, _ = model.process_attempt(s, "divide", 45, is_correct=False, solve_ms=9000)
    weak = model.weak_operations(s)
    assert "divide" in weak
    assert "add" not in weak


def test_weak_operations_ignores_operations_below_min_samples():
    s = model.default_model_state()
    for _ in range(model.WEAK_MIN_SAMPLES - 1):
        s, _ = model.process_attempt(s, "divide", 45, is_correct=False, solve_ms=9000)
    assert "divide" not in model.weak_operations(s)


def test_backfill_operation_ratings_replays_history():
    attempts = [
        {"operation": "divide", "difficulty": 45.0,
         "is_correct": 0, "ms_to_submit": 9000}
        for _ in range(15)
    ]
    ops = model.backfill_operation_ratings(attempts)
    assert ops["divide"]["count"] == 15
    assert ops["divide"]["rating"] < model.DEFAULT_RATING
    assert ops["add"]["rating"] == model.DEFAULT_RATING


def test_backfill_operation_ratings_empty_history():
    ops = model.backfill_operation_ratings([])
    assert ops == model.default_model_state()["operations"]
