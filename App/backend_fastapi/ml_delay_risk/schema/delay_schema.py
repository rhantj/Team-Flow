from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    NORMAL = "NORMAL"
    CAUTION = "CAUTION"
    DANGER = "DANGER"


class PredictRequest(BaseModel):
    issue_key: str = Field(..., description="예측할 Jira 이슈 키 또는 _id (예: 'JELLY-1')")


class BatchPredictRequest(BaseModel):
    issue_keys: List[str] = Field(..., min_length=1)


class PredictResponse(BaseModel):
    issue_key: str
    risk_class: RiskLevel
    class_probabilities: Dict[str, float]
    elapsed_hours: float
    hours_until_deadline: float
    blocked_hours: float
    original_estimate_hours: Optional[float] = None


class BatchPredictResponse(BaseModel):
    results: List[PredictResponse]


class HealthResponse(BaseModel):
    service: str
    status: str
    model_loaded: bool
