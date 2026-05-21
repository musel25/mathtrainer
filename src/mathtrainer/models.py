"""Request/response models for the API."""
from __future__ import annotations

from pydantic import BaseModel


class AttemptIn(BaseModel):
    operation: str
    operands: list[int]
    correct_answer: int
    given_answer: int | None
    is_correct: bool
    difficulty: float
    features: dict
    ms_to_first_key: int | None
    ms_to_submit: int
    trick_slug: str | None = None
    score: float = 0.0


class SessionCreateIn(BaseModel):
    mode: str = "daily"


class SessionCreateOut(BaseModel):
    id: int


class SessionFinishIn(BaseModel):
    attempts: list[AttemptIn]


class SessionSummary(BaseModel):
    session_id: int
    n_questions: int
    n_correct: int
    accuracy: float
    total_score: float
