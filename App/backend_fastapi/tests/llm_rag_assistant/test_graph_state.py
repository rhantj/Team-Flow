from __future__ import annotations

import pytest
from pydantic import ValidationError

from llm_rag_assistant.app.graph.state import (
    LEADER_TOOLS,
    MEMBER_TOOLS,
    SUPPORTED_TOOLS,
    Action,
    requires_leader,
)


def test_action_accepts_known_tool() -> None:
    action = Action(tool="change_status", task_ref="WF-250", args={"to": "done"})
    assert action.tool == "change_status"


def test_action_rejects_unknown_tool() -> None:
    """모델이 만들어낸 도구 이름이 실행 경로로 새어나가면 안 된다."""
    with pytest.raises(ValidationError):
        Action(tool="drop_database", task_ref="WF-250", args={})


def test_member_and_leader_tool_sets_are_disjoint() -> None:
    assert MEMBER_TOOLS.isdisjoint(LEADER_TOOLS)


def test_requires_leader_flags_only_leader_tools() -> None:
    assert requires_leader("delete_task") is True
    assert requires_leader("set_due_date") is True
    assert requires_leader("add_comment") is False
    assert requires_leader("change_status") is False


def test_supported_tools_are_a_subset_of_all_tools() -> None:
    # 실행기가 수행 가능한 도구는 전체 도구의 부분집합이어야 한다(현재는 멤버 도구).
    assert SUPPORTED_TOOLS <= MEMBER_TOOLS | LEADER_TOOLS


def test_action_rejects_empty_task_ref() -> None:
    with pytest.raises(ValidationError):
        Action(tool="change_status", task_ref="  ", args={"to": "done"})


def test_change_status_rejects_invalid_status() -> None:
    with pytest.raises(ValidationError):
        Action(tool="change_status", task_ref="WF-1", args={"to": "확인중"})


def test_change_status_requires_to() -> None:
    with pytest.raises(ValidationError):
        Action(tool="change_status", task_ref="WF-1", args={})


def test_add_comment_rejects_empty_content() -> None:
    with pytest.raises(ValidationError):
        Action(tool="add_comment", task_ref="WF-1", args={"content": "   "})


def test_toggle_checklist_requires_item_and_bool_done() -> None:
    with pytest.raises(ValidationError):
        Action(tool="toggle_checklist", task_ref="WF-1", args={"item": "", "done": True})
    with pytest.raises(ValidationError):
        Action(tool="toggle_checklist", task_ref="WF-1", args={"item": "리뷰", "done": "yes"})


def test_toggle_checklist_accepts_valid_args() -> None:
    action = Action(tool="toggle_checklist", task_ref="WF-1", args={"item": "리뷰", "done": False})
    assert action.args["done"] is False


def test_set_due_date_rejects_bad_date_format() -> None:
    with pytest.raises(ValidationError):
        Action(tool="set_due_date", task_ref="WF-1", args={"date": "8월 10일"})


def test_set_due_date_accepts_iso_date() -> None:
    action = Action(tool="set_due_date", task_ref="WF-1", args={"date": "2026-08-10"})
    assert action.args["date"] == "2026-08-10"


def test_delete_task_needs_no_args() -> None:
    action = Action(tool="delete_task", task_ref="WF-1", args={})
    assert action.tool == "delete_task"
