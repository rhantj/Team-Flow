from __future__ import annotations

from enum import Enum
from typing import Dict, List

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    NORMAL = "NORMAL"
    CAUTION = "CAUTION"
    DANGER = "DANGER"


class HealthResponse(BaseModel):
    service: str
    status: str
    model_loaded: bool


class TaskDelayPredictionItem(BaseModel):
    task_id: int
    risk_class: RiskLevel
    result: str = Field(..., description="정상/주의/위험 (ml_predictions.result에 저장되는 값)")
    score: float = Field(..., description="예측된 클래스의 확신도 (0~1)")
    class_probabilities: Dict[str, float]


class TaskDelayPredictResponse(BaseModel):
    project_id: int
    predicted_count: int
    results: List[TaskDelayPredictionItem]
