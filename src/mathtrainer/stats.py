"""Pure aggregation of sessions/attempts into habit and progress stats.

Row dicts in, plain aggregate structures out. No database access here.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta


def _date_of(iso_ts: str) -> str:
    """The local-time calendar date ('YYYY-MM-DD') of an ISO timestamp.

    Timestamps are stored in UTC; the habit "day" is the user's *local* day,
    so convert before taking the date — otherwise a late-evening session can
    land on the wrong calendar day off UTC."""
    return datetime.fromisoformat(iso_ts).astimezone().date().isoformat()


def daily_aggregates(sessions: list[dict]) -> dict[str, dict]:
    """Maps date string -> {questions, score, minutes} over finished DAILY
    sessions. Learn-mode sessions are excluded — only the daily drill counts
    toward the habit streak, goal, and heatmap."""
    out: dict[str, dict] = {}
    for s in sessions:
        if not s.get("ended_at"):
            continue
        if s.get("mode") != "daily":
            continue
        day = _date_of(s["ended_at"])   # credit the session to the day it ended
        agg = out.setdefault(day, {"questions": 0, "score": 0.0, "minutes": 0.0})
        agg["questions"] += s["n_questions"]
        agg["score"] += s["total_score"]
        if s.get("started_at"):
            seconds = (
                datetime.fromisoformat(s["ended_at"])
                - datetime.fromisoformat(s["started_at"])
            ).total_seconds()
            agg["minutes"] += max(0.0, seconds / 60.0)
    return out


def streak(daily: dict[str, dict], goal: int, today: date) -> int:
    """Consecutive days, ending at `today`, whose question count met `goal`.

    Today is treated as still in progress: an unmet `today` — whether untouched
    or only partially done — does not break a streak earned through yesterday.
    A gap (unmet day) on any day *before* today ends the streak."""
    count = 0
    day = today
    while True:
        agg = daily.get(day.isoformat())
        met = agg is not None and agg["questions"] >= goal
        if met:
            count += 1
            day -= timedelta(days=1)
        elif day == today:
            day -= timedelta(days=1)   # today not done yet — look back
        else:
            break
    return count


def heatmap(daily: dict[str, dict], today: date, days: int = 112) -> list[dict]:
    """One cell per day for the last `days` days, oldest first."""
    cells = []
    for i in range(days - 1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        agg = daily.get(day)
        cells.append({
            "date": day,
            "score": agg["score"] if agg else 0.0,
            "questions": agg["questions"] if agg else 0,
        })
    return cells


def progress_series(sessions: list[dict], attempts: list[dict]) -> list[dict]:
    """Per finished session (chronological): rating, score, accuracy."""
    finished = sorted(
        (s for s in sessions if s.get("ended_at")), key=lambda s: s["ended_at"]
    )
    correct_total: dict[int, list[int]] = {}
    for a in attempts:
        c = correct_total.setdefault(a["session_id"], [0, 0])
        c[1] += 1
        if a["is_correct"]:
            c[0] += 1
    series = []
    for n, s in enumerate(finished, start=1):
        corr, tot = correct_total.get(s["id"], [0, 0])
        series.append({
            "n": n,
            "rating": s.get("rating_after"),
            "score": s["total_score"],
            "accuracy": (corr / tot) if tot else 0.0,
        })
    return series


def operation_times(attempts: list[dict]) -> list[dict]:
    """Average solve-time (ms) per operation, over correct attempts only."""
    sums: dict[str, list[float]] = {}
    for a in attempts:
        if not a["is_correct"]:
            continue
        agg = sums.setdefault(a["operation"], [0.0, 0])
        agg[0] += a["ms_to_submit"]
        agg[1] += 1
    return [
        {"operation": op, "avg_ms": total / n}
        for op, (total, n) in sorted(sums.items()) if n
    ]
