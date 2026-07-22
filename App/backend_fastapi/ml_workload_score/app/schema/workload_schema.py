from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel

CURRENT_WORKLOAD_SCHEMA_VERSION = "1.0"


class WorkloadMemberResult(BaseModel):
    assignee_id: str
    task_count_total: int
    completion_rate: float
    overload_score: float
    is_anomaly: bool
    anomaly_type: str
    # --- 편중도 근거 패널용 신규 필드 (build_features()가 이미 계산하던 값) ---
    task_count_active_rel: float
    difficulty_avg_rel: float
    overdue_count: int


class WorkloadScoreData(BaseModel):
    schema_version: str = CURRENT_WORKLOAD_SCHEMA_VERSION
    project_id: int
    source: str  # "db" | "synthetic_fallback"
    method: str  # "MAD (소규모 팀)" | "Isolation Forest (대규모)"
    members: List[WorkloadMemberResult]
    note: Optional[str] = None


class WorkloadScoreResponse(BaseModel):
    success: bool
    data: Optional[WorkloadScoreData] = None
    error: Optional[dict] = None
