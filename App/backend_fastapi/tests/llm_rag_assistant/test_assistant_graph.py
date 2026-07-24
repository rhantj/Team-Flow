from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.graph.state import Action
from llm_rag_assistant.app.graph.task_resolver import TaskCandidate, TaskMatch


@pytest.fixture(autouse=True)
def use_memory_checkpointer(monkeypatch: pytest.MonkeyPatch) -> None:
    from langgraph.checkpoint.memory import InMemorySaver

    from llm_rag_assistant.app.graph import assistant_graph

    compiled = assistant_graph._build().compile(checkpointer=InMemorySaver())

    async def _get_graph():
        return compiled

    monkeypatch.setattr(assistant_graph, "get_graph", _get_graph)


def _state(question: str, role: str = "MEMBER") -> dict:
    return {
        "question": question,
        "history": [],
        "project_id": 1,
        "user_id": 2,
        "user_role": role,
    }


@pytest.mark.asyncio
async def test_member_command_produces_confirm_card() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="change_status", task_ref="WF-250", args={"to": "done"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무 생성 모달 구현")),
    ):
        outcome = await start_command(object(), _state("WF-250 완료로 바꿔줘"))

    assert outcome.type == "confirm"
    assert outcome.card is not None
    assert outcome.card.tool == "change_status"
    assert outcome.card.task_id == 37
    assert outcome.thread_id


@pytest.mark.asyncio
async def test_member_is_blocked_before_card_for_leader_tool() -> None:
    """권한 없는 작업은 카드를 만들지 않는다. 누르면 실패할 버튼을 보여주지 않기 위해서다."""
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="set_due_date", task_ref="WF-250", args={"date": "2026-08-10"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        outcome = await start_command(object(), _state("마감일 8월 10일로 지정해줘", role="MEMBER"))

    assert outcome.type == "done"
    assert outcome.card is None
    assert "팀장" in outcome.message


@pytest.mark.asyncio
async def test_leader_tool_blocked_as_unsupported_even_for_leader() -> None:
    """실행기가 아직 수행 못 하는 팀장 도구는 권한을 통과해도 카드를 만들지 않는다
    (누르면 프론트가 거부하는 계약 불일치 방지)."""
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    # change_assignee는 아직 실행기 미구현이라 SUPPORTED_TOOLS에 없다.
    plan = [Action(tool="change_assignee", task_ref="WF-250", args={"assignee_name": "김철수"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        outcome = await start_command(object(), _state("담당자 바꿔줘", role="LEADER"))

    assert outcome.type == "done"
    assert outcome.card is None
    assert "지원하지 않" in outcome.message


@pytest.mark.asyncio
async def test_leader_can_set_due_date() -> None:
    """set_due_date는 팀장 전용이지만 이제 실행기가 지원한다. 팀장은 확인 카드를 받는다."""
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="set_due_date", task_ref="WF-250", args={"date": "2026-08-10"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=50, title="FS-3 대시보드/지연 위험도 WF-195")),
    ):
        outcome = await start_command(object(), _state("마감일 8월 10일로 지정해줘", role="LEADER"))

    assert outcome.type == "confirm"
    assert outcome.card is not None
    assert outcome.card.tool == "set_due_date"
    assert outcome.card.task_id == 50
    assert outcome.card.args["date"] == "2026-08-10"


@pytest.mark.asyncio
async def test_empty_plan_asks_again() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=[])
    ):
        outcome = await start_command(object(), _state("어쩌구 저쩌구 해줘"))

    assert outcome.type == "done"
    assert outcome.card is None


@pytest.mark.asyncio
async def test_unresolved_task_reports_not_found() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="add_comment", task_ref="없는 업무", args={"content": "확인"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch()),
    ):
        outcome = await start_command(object(), _state("없는 업무에 코멘트 남겨줘"))

    assert outcome.type == "done"
    assert outcome.card is None
    assert "찾지 못했" in outcome.message


@pytest.mark.asyncio
async def test_ambiguous_task_asks_user_to_choose() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="add_comment", task_ref="로그인", args={"content": "확인"})]
    match = TaskMatch(
        candidates=[
            TaskCandidate(task_id=37, title="로그인 API 구현"),
            TaskCandidate(task_id=38, title="로그인 화면 개선"),
        ]
    )
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=match),
    ):
        outcome = await start_command(object(), _state("로그인에 코멘트 남겨줘"))

    assert outcome.type == "done"
    assert "로그인 API 구현" in outcome.message
    assert "로그인 화면 개선" in outcome.message


@pytest.mark.asyncio
async def test_resume_with_success_completes_command() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import resume_command, start_command

    plan = [Action(tool="change_status", task_ref="WF-250", args={"to": "done"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무 생성 모달 구현")),
    ):
        started = await start_command(object(), _state("WF-250 완료로 바꿔줘"))
        resumed = await resume_command(
            started.thread_id, {"step_id": started.card.step_id, "ok": True}
        )

    assert resumed.type == "done"
    assert resumed.card is None


@pytest.mark.asyncio
async def test_resume_with_failure_reports_it() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import resume_command, start_command

    plan = [Action(tool="change_status", task_ref="WF-250", args={"to": "done"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        started = await start_command(object(), _state("WF-250 완료로 바꿔줘"))
        resumed = await resume_command(
            started.thread_id,
            {"step_id": started.card.step_id, "ok": False, "error": "업무를 찾을 수 없습니다"},
        )

    assert resumed.type == "done"
    assert "업무를 찾을 수 없습니다" in resumed.message


@pytest.mark.asyncio
async def test_resume_rejects_mismatched_step_id() -> None:
    """대기 중인 단계와 다른 step_id로 온 결과는 그래프를 진행시키지 않는다
    (잘못됐거나 재전송된 결과 방어)."""
    from llm_rag_assistant.app.graph.assistant_graph import resume_command, start_command

    plan = [Action(tool="change_status", task_ref="WF-250", args={"to": "done"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        started = await start_command(object(), _state("WF-250 완료로 바꿔줘"))
        resumed = await resume_command(
            started.thread_id, {"step_id": "9-deadbeef", "ok": True}
        )

    assert resumed.type == "done"
    assert "일치하지 않" in resumed.message or "이미 처리" in resumed.message
    assert resumed.card is None


@pytest.mark.asyncio
async def test_resume_rejects_when_pending_step_cannot_be_determined(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """대기 단계를 특정하지 못하면(step_id 추출 실패) fail-closed로 거부한다."""
    from llm_rag_assistant.app.graph import assistant_graph
    from llm_rag_assistant.app.graph.assistant_graph import resume_command, start_command

    plan = [Action(tool="change_status", task_ref="WF-250", args={"to": "done"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        started = await start_command(object(), _state("WF-250 완료로 바꿔줘"))
        monkeypatch.setattr(assistant_graph, "_pending_step_id", lambda snapshot: None)
        resumed = await resume_command(
            started.thread_id, {"step_id": started.card.step_id, "ok": True}
        )

    assert resumed.type == "done"
    assert resumed.card is None
    assert "일치하지 않" in resumed.message or "이미 처리" in resumed.message


@pytest.mark.asyncio
async def test_expired_thread_is_reported() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import resume_command

    outcome = await resume_command("nonexistent-thread-id", {"step_id": "x", "ok": True})
    assert outcome.type == "done"
    assert "만료" in outcome.message
