"""Request/response models for the API."""
from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from .model import DEFAULT_ENABLED_OPERATIONS, OPERATIONS


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
    rating_before: float
    rating_after: float
    weak_operations: list[str]


class DifficultyBandModel(BaseModel):
    min: float
    max: float


class SessionPlan(BaseModel):
    rating: float
    target_band: DifficultyBandModel
    operation_ratings: dict[str, float]
    session_length: int
    enabled_operations: list[str]


class SettingsModel(BaseModel):
    daily_goal: int = Field(ge=1)
    session_length: int = Field(ge=1)
    enabled_operations: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ENABLED_OPERATIONS)
    )

    @field_validator("enabled_operations")
    @classmethod
    def _check_operations(cls, ops: list[str]) -> list[str]:
        if not ops:
            raise ValueError("at least one operation must be enabled")
        unknown = [op for op in ops if op not in OPERATIONS]
        if unknown:
            raise ValueError(f"unknown operations: {unknown}")
        # de-duplicate while preserving order
        return list(dict.fromkeys(ops))
