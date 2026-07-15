from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel


class WorkloadMemberResult(BaseModel):
    assignee_id: str
    task_count_total: int
    completion_rate: float
    overload_score: float
    is_anomaly: bool
    anomaly_type: str


class WorkloadScoreData(BaseModel):
    project_id: int
    source: str  # "db" | "synthetic_fallback"
    method: str  # "MAD (소규모 팀)" | "Isolation Forest (대규모)"
    members: List[WorkloadMemberResult]
    note: Optional[str] = None


class WorkloadScoreResponse(BaseModel):
    success: bool
    data: Optional[WorkloadScoreData] = None
    error: Optional[dict] = None
