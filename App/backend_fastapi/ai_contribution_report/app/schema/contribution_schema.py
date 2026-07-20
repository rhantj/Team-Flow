from __future__ import annotations

from pydantic import BaseModel


class ContributionReportRequest(BaseModel):
    project_id: int


class MemberContribution(BaseModel):
    user_id: int
    name: str
    summary: str
    evidence: list[str]
