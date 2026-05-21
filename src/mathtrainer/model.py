"""Adaptive personal model: solve-time baselines, skill rating, scoring.

Pure functions over a plain-dict state so the whole model round-trips through
JSON in the `model_state` table. See the design spec, section 5.

State shape:
    {
      "rating": float,                       # 1..100, Elo-style (overall)
      "bins": [{"mean", "var", "count"}] * N_BINS,   # solve-time EWMA per
                                             # difficulty bin (correct answers)
      "operations": {operation: {"rating", "count"}},  # per-operation
                                             # Elo-style rating, 1..100
    }
"""
from __future__ import annotations

import math

N_BINS = 10
BIN_WIDTH = 10                 # difficulty runs 1..100
EWMA_ALPHA = 0.25
DEFAULT_RATING = 50.0
RATING_K = 4.0                 # rating step size
RATING_SCALE = 15.0            # logistic scale for expected success
MIN_SPREAD_MS = 400.0
DEFAULT_SPREAD_MS = 2000.0
DEFAULT_BASELINE_MS = [1500, 2200, 3000, 4000, 5200,
                       6600, 8200, 10000, 12200, 14500]
WEAK_MIN_SAMPLES = 3
WEAK_RATING_MARGIN = 8.0       # operation is "weak" when its rating is this far below overall
OPERATIONS = ["add", "subtract", "multiply", "divide", "square", "percent"]


def bin_index(difficulty: float) -> int:
    """Maps a 1..100 difficulty to a 0..N_BINS-1 bin."""
    raw = int((difficulty - 1) // BIN_WIDTH)
    return max(0, min(N_BINS - 1, raw))


def default_model_state() -> dict:
    return {
        "rating": DEFAULT_RATING,
        "bins": [{"mean": 0.0, "var": 0.0, "count": 0} for _ in range(N_BINS)],
        "operations": {
            op: {"rating": DEFAULT_RATING, "count": 0} for op in OPERATIONS
        },
    }


def expected_time(state: dict, difficulty: float) -> float:
    """The user's expected solve-time (ms) for a question of this difficulty.
    Falls back to the default baseline curve for an unseen bin (cold start)."""
    idx = bin_index(difficulty)
    b = state["bins"][idx]
    if b["count"] > 0:
        return b["mean"]
    return float(DEFAULT_BASELINE_MS[idx])


def spread(state: dict, difficulty: float) -> float:
    """The spread (ms) of the user's solve-times for this difficulty."""
    b = state["bins"][bin_index(difficulty)]
    if b["count"] > 1:
        return max(math.sqrt(max(b["var"], 0.0)), MIN_SPREAD_MS)
    return DEFAULT_SPREAD_MS


def _speed_factor(z: float) -> float:
    """Bounded reward for beating your baseline. z>0 means faster than expected.
    Returns a value in [0.5, 1.5] (tanh saturates to ±1.0 for large |z|)."""
    return 1.0 + 0.5 * math.tanh(z)


def score_attempt(
    state: dict, difficulty: float, is_correct: bool, solve_ms: float
) -> float:
    """Points for one attempt, measured against the user's own baseline."""
    if not is_correct:
        return 0.0
    z = (expected_time(state, difficulty) - solve_ms) / spread(state, difficulty)
    return difficulty * _speed_factor(z)


def _update_bin(state: dict, difficulty: float, solve_ms: float) -> dict:
    bins = [dict(b) for b in state["bins"]]
    b = bins[bin_index(difficulty)]
    if b["count"] == 0:
        b["mean"] = float(solve_ms)
        b["var"] = DEFAULT_SPREAD_MS ** 2
        b["count"] = 1
    else:
        delta = solve_ms - b["mean"]
        b["mean"] = b["mean"] + EWMA_ALPHA * delta
        b["var"] = (1 - EWMA_ALPHA) * (b["var"] + EWMA_ALPHA * delta * delta)
        b["count"] = b["count"] + 1
    return {**state, "bins": bins}


def _update_rating(
    state: dict, difficulty: float, is_correct: bool, solve_ms: float
) -> dict:
    r = state["rating"]
    p = 1.0 / (1.0 + math.exp(-(r - difficulty) / RATING_SCALE))
    success = 1.0 if (is_correct and solve_ms <= expected_time(state, difficulty)) else 0.0
    new_r = r + RATING_K * (success - p)
    return {**state, "rating": max(1.0, min(100.0, new_r))}


def _update_op_rating(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> dict:
    """Elo-style update of one operation's own rating, scored against that
    operation's current rating. Mirrors `_update_rating` but per-operation."""
    operations = {op: dict(v) for op, v in state["operations"].items()}
    rec = operations.setdefault(operation, {"rating": DEFAULT_RATING, "count": 0})
    r = rec["rating"]
    p = 1.0 / (1.0 + math.exp(-(r - difficulty) / RATING_SCALE))
    success = 1.0 if (is_correct and solve_ms <= expected_time(state, difficulty)) else 0.0
    rec["rating"] = max(1.0, min(100.0, r + RATING_K * (success - p)))
    rec["count"] = rec["count"] + 1
    return {**state, "operations": operations}


def process_attempt(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> tuple[dict, float]:
    """Scores one attempt against the CURRENT state, then returns the updated
    state and the score. The score and both rating updates (global and
    per-operation) are computed from pre-attempt values — each rating's logistic
    expectation reads its own pre-update rating, and `expected_time` reads the
    pre-update solve-time bins. Pure: `state` is not mutated."""
    score = score_attempt(state, difficulty, is_correct, solve_ms)
    new_state = _update_rating(state, difficulty, is_correct, solve_ms)
    new_state = _update_op_rating(
        new_state, operation, difficulty, is_correct, solve_ms,
    )
    if is_correct:
        new_state = _update_bin(new_state, difficulty, solve_ms)
    return new_state, score


def operation_ratings(state: dict) -> dict:
    """Each operation's current rating (1..100)."""
    return {op: rec["rating"] for op, rec in state["operations"].items()}


def weak_operations(state: dict) -> list[str]:
    """Operations whose own rating sits well below the overall rating —
    candidates for extra practice. Operations with too few attempts to be
    reliable are excluded."""
    overall = state["rating"]
    return [
        op for op, rec in state["operations"].items()
        if rec["count"] >= WEAK_MIN_SAMPLES
        and overall - rec["rating"] > WEAK_RATING_MARGIN
    ]


def target_band(state: dict) -> dict:
    """The difficulty band to aim the next session at — centered just above the
    rating (10 below to 20 above), the edge-of-ability zone for fastest learning."""
    r = state["rating"]
    return {
        "min": max(1.0, r - 10.0),
        "max": min(100.0, r + 20.0),
    }


def backfill_operation_ratings(attempts: list[dict]) -> dict:
    """Replays a chronological list of attempt rows through the model to
    reconstruct per-operation ratings for a database that predates them.
    Each row needs: operation, difficulty, is_correct, ms_to_submit.
    Returns the `operations` map ({operation: {"rating", "count"}}).

    Note: the solve-time bins are rebuilt from scratch during replay, so the
    expected-time thresholds for the earliest attempts use the default baseline
    curve rather than the user's live values; ratings converge quickly."""
    state = default_model_state()
    for a in attempts:
        state, _ = process_attempt(
            state, a["operation"], float(a["difficulty"]),
            bool(a["is_correct"]), float(a["ms_to_submit"]),
        )
    return state["operations"]
