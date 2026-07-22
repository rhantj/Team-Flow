from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class RagIngestRequest(BaseModel):
    project_id: int
    source_type: Literal["meeting", "task", "action_item"]
    source_id: int
    content: str
    assignee_id: int | None = None


class RagIngestResponse(BaseModel):
    chunk_ids: list[int]
    chunk_count: int


class RagAssigneeSyncRequest(BaseModel):
    project_id: int
    source_type: Literal["task", "action_item"]
    source_id: int
    assignee_id: int | None = None


class RagQueryRequest(BaseModel):
    project_id: int
    question: str
    user_id: int | None = None


class RagSource(BaseModel):
    source_type: Literal["meeting", "task", "action_item"]
    source_id: int
    content_snippet: str
    similarity: float


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource]
