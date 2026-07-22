from __future__ import annotations

import pytest
from pydantic import ValidationError

from llm_checklist.app.checklist_pipeline import (
    build_checklist_prompt,
    parse_checklist_response,
)
from llm_checklist.app.checklist_schema import ChecklistGenerateRequest


def test_parse_non_dict_json_raises_valueerror():
    # LLM이 객체가 아닌 배열을 반환해도 AttributeError가 아니라 ValueError로 실패해야 한다.
    with pytest.raises(ValueError):
        parse_checklist_response('[{"title": "x"}]')


def test_request_rejects_overlong_title():
    with pytest.raises(ValidationError):
        ChecklistGenerateRequest(title="가" * 201)


def test_request_rejects_too_many_existing_items():
    with pytest.raises(ValidationError):
        ChecklistGenerateRequest(title="작업", existing_items=[f"항목{i}" for i in range(101)])


def test_parse_valid_json_returns_suggestions():
    raw = '{"items": [{"title": "API 설계", "reason": "기반"}, {"title": "단위 테스트 작성", "reason": ""}]}'
    items = parse_checklist_response(raw)
    assert [i.title for i in items] == ["API 설계", "단위 테스트 작성"]
    assert items[0].reason == "기반"


def test_parse_strips_code_fence():
    items = parse_checklist_response('```json\n{"items": [{"title": "구현"}]}\n```')
    assert items[0].title == "구현"


def test_parse_broken_json_raises():
    with pytest.raises(Exception):
        parse_checklist_response("not json")


def test_parse_empty_items_raises():
    with pytest.raises(ValueError):
        parse_checklist_response('{"items": []}')


def test_build_prompt_includes_task_fields_and_existing():
    req = ChecklistGenerateRequest(title="로그인 구현", category="backend", existing_items=["API 설계"])
    prompt = build_checklist_prompt(req)
    assert "로그인 구현" in prompt and "backend" in prompt and "API 설계" in prompt
