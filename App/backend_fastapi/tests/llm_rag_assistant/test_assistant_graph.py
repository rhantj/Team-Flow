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
async def test_leader_passes_permission_check() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import start_command

    plan = [Action(tool="set_due_date", task_ref="WF-250", args={"date": "2026-08-10"})]
    with patch(
        "llm_rag_assistant.app.graph.assistant_graph.plan_actions", new=AsyncMock(return_value=plan)
    ), patch(
        "llm_rag_assistant.app.graph.assistant_graph.resolve_task_ref",
        new=AsyncMock(return_value=TaskMatch(task_id=37, title="업무")),
    ):
        outcome = await start_command(object(), _state("마감일 지정해줘", role="LEADER"))

    assert outcome.type == "confirm"


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
async def test_expired_thread_is_reported() -> None:
    from llm_rag_assistant.app.graph.assistant_graph import resume_command

    outcome = await resume_command("nonexistent-thread-id", {"step_id": "x", "ok": True})
    assert outcome.type == "done"
    assert "만료" in outcome.message
