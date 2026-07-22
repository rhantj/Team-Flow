from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float
    task_component: float
    meeting_component: float
    contribution_score: float
    # --- 편중도 근거 패널용 신규 필드 (WorkloadMemberResult에서 그대로 복사) ---
    anomaly_type: str
    task_count_active_rel: float
    difficulty_avg_rel: float
    overdue_count: int


class ContributionScoreData(BaseModel):
    schema_version: str = "1.0"
    project_id: int
    members: list[ContributionMemberResult]
    note: Optional[str] = None


class ContributionScoreResponse(BaseModel):
    success: bool
    data: Optional[ContributionScoreData] = None
    error: Optional[dict] = None
