from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from llm_rag_assistant.app.schema.chat_schema import RagHistoryMessage, RagSource


class AssistantCommandRequest(BaseModel):
    project_id: int
    question: str
    user_id: int | None = None
    # Spring이 인증 세션에서 조회해 넣는다. 요청 바디 값을 덮어쓰므로 클라이언트가 위조할 수 없다.
    # 팀장 전용 도구는 LEADER만 통과시킨다(REVIEWER도 차단).
    user_role: Literal["LEADER", "MEMBER", "REVIEWER"] = "MEMBER"
    history: list[RagHistoryMessage] = []


class AssistantResumeRequest(BaseModel):
    thread_id: str
    step_id: str
    ok: bool
    error: str | None = None


class ActionCard(BaseModel):
    """실행 승인을 받기 위해 프론트에 보내는 확인 카드."""

    step_id: str
    tool: str
    task_id: int | None = None
    title: str
    summary: str
    args: dict


class AssistantResponse(BaseModel):
    # answer: 그냥 답변 / confirm: 카드 승인 필요 / done: 명령 완료
    type: Literal["answer", "confirm", "done"]
    message: str
    sources: list[RagSource] = []
    thread_id: str | None = None
    card: ActionCard | None = None
