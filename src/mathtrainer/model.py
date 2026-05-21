"""Adaptive personal model: solve-time baselines, skill rating, scoring.

Pure functions over a plain-dict state so the whole model round-trips through
JSON in the `model_state` table. See the design spec, section 5.

State shape:
    {
      "rating": float,                       # 1..100, Elo-style
      "bins": [{"mean", "var", "count"}] * N_BINS,   # solve-time EWMA per
                                             # difficulty bin (correct answers)
      "residuals": {operation: {"mean", "count"}},   # EWMA of (solve - expected)
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
WEAK_RESIDUAL_MS = 1200.0      # operation is "weak" when its EWMA residual exceeds this
WEAK_MIN_SAMPLES = 3
OPERATIONS = ["add", "subtract", "multiply", "divide", "square", "percent"]


def bin_index(difficulty: float) -> int:
    """Maps a 1..100 difficulty to a 0..N_BINS-1 bin."""
    raw = int((difficulty - 1) // BIN_WIDTH)
    return max(0, min(N_BINS - 1, raw))


def default_model_state() -> dict:
    return {
        "rating": DEFAULT_RATING,
        "bins": [{"mean": 0.0, "var": 0.0, "count": 0} for _ in range(N_BINS)],
        "residuals": {op: {"mean": 0.0, "count": 0} for op in OPERATIONS},
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


def _update_residual(
    state: dict, operation: str, expected_ms: float, solve_ms: float
) -> dict:
    residuals = {op: dict(v) for op, v in state["residuals"].items()}
    res = residuals.setdefault(operation, {"mean": 0.0, "count": 0})
    residual = solve_ms - expected_ms
    if res["count"] == 0:
        res["mean"] = residual
    else:
        res["mean"] = res["mean"] + EWMA_ALPHA * (residual - res["mean"])
    res["count"] = res["count"] + 1
    return {**state, "residuals": residuals}


def process_attempt(
    state: dict, operation: str, difficulty: float,
    is_correct: bool, solve_ms: float,
) -> tuple[dict, float]:
    """Scores one attempt against the CURRENT state, then returns the updated
    state and the score. Score and rating are measured against the pre-update
    baseline. Pure: `state` is not mutated."""
    score = score_attempt(state, difficulty, is_correct, solve_ms)
    new_state = _update_rating(state, difficulty, is_correct, solve_ms)
    if is_correct:
        expected_ms = expected_time(state, difficulty)
        new_state = _update_residual(new_state, operation, expected_ms, solve_ms)
        new_state = _update_bin(new_state, difficulty, solve_ms)
    return new_state, score


def weak_operations(state: dict) -> list[str]:
    """Operations the user is reliably slower at than their own baseline."""
    return [
        op for op, res in state["residuals"].items()
        if res["count"] >= WEAK_MIN_SAMPLES and res["mean"] > WEAK_RESIDUAL_MS
    ]


def target_band(state: dict) -> dict:
    """The difficulty band to aim the next session at — centered just above the
    rating (10 below to 20 above), the edge-of-ability zone for fastest learning."""
    r = state["rating"]
    return {
        "min": max(1.0, r - 10.0),
        "max": min(100.0, r + 20.0),
    }
