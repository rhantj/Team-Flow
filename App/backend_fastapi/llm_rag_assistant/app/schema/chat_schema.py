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


class RagHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RagQueryRequest(BaseModel):
    project_id: int
    question: str
    user_id: int | None = None
    # 클라이언트가 보내는 직전 대화 기록. 후속 질문 재작성에만 쓰며, 서버는 이 대화의
    # 진위를 검증하지 않는다(권한값은 여기서 유도하지 않음). 기본값 빈 리스트로 기존 클라이언트 호환.
    history: list[RagHistoryMessage] = []


class RagSource(BaseModel):
    source_type: Literal["meeting", "task", "action_item"]
    source_id: int
    content_snippet: str
    similarity: float


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource]
