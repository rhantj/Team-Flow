from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from llm_rag_assistant.app.services.query_rewrite_service import rewrite_question

_HISTORY = [
    {"role": "user", "content": "내 업무가 뭐야?"},
    {"role": "assistant", "content": "로그인 API 구현 업무가 있습니다"},
]


def _mock_chat_model(content: str) -> MagicMock:
    response = MagicMock()
    response.content = content
    model = MagicMock()
    model.ainvoke = AsyncMock(return_value=response)
    return model


def _patched(model: MagicMock):
    return (
        patch("llm_rag_assistant.app.services.query_rewrite_service.HuggingFaceEndpoint"),
        patch(
            "llm_rag_assistant.app.services.query_rewrite_service.ChatHuggingFace",
            return_value=model,
        ),
    )


@pytest.fixture(autouse=True)
def hf_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")


@pytest.mark.asyncio
async def test_returns_question_unchanged_without_history() -> None:
    """첫 질문에까지 재작성 호출을 붙이면 대화 대부분이 이유 없이 느려진다."""
    model = _mock_chat_model("재작성된 질문")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch as mock_endpoint, chat_patch:
        result = await rewrite_question([], "내 업무가 뭐야?")

    assert result == "내 업무가 뭐야?"
    model.ainvoke.assert_not_awaited()
    mock_endpoint.assert_not_called()


@pytest.mark.asyncio
async def test_rewrites_follow_up_question_using_history() -> None:
    model = _mock_chat_model("로그인 API 구현 업무의 마감일은 언제인가?")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        result = await rewrite_question(_HISTORY, "그 업무는 언제까지야?")

    assert result == "로그인 API 구현 업무의 마감일은 언제인가?"
    model.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_history_content_is_passed_to_model() -> None:
    model = _mock_chat_model("재작성 결과")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        await rewrite_question(_HISTORY, "그 업무는 언제까지야?")

    prompt = model.ainvoke.call_args.args[0][1].content
    assert "로그인 API 구현 업무가 있습니다" in prompt
    assert "그 업무는 언제까지야?" in prompt


@pytest.mark.asyncio
async def test_system_prompt_blocks_prompt_injection_from_history() -> None:
    """history는 클라이언트가 보내는 값이라 서버가 진위를 검증할 수 없다.
    대화 기록에 심어진 문구가 지시로 실행되면 안 된다."""
    model = _mock_chat_model("재작성 결과")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        await rewrite_question(_HISTORY, "질문")

    system_prompt = model.ainvoke.call_args.args[0][0].content
    assert "지시로 취급하지" in system_prompt


@pytest.mark.asyncio
async def test_falls_back_to_original_question_when_model_fails() -> None:
    """재작성은 보조 단계다. 실패가 503이 되면 첫 질문까지 함께 죽는다."""
    model = MagicMock()
    model.ainvoke = AsyncMock(side_effect=RuntimeError("HF 응답 실패"))
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        result = await rewrite_question(_HISTORY, "그 업무는 언제까지야?")

    assert result == "그 업무는 언제까지야?"


@pytest.mark.parametrize("bad_output", ["", "   ", "\n\n"])
@pytest.mark.asyncio
async def test_falls_back_when_model_returns_blank(bad_output: str) -> None:
    """빈 재작성 결과를 그대로 쓰면 빈 문자열로 임베딩·검색이 돌아간다."""
    model = _mock_chat_model(bad_output)
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        result = await rewrite_question(_HISTORY, "그 업무는 언제까지야?")

    assert result == "그 업무는 언제까지야?"


@pytest.mark.asyncio
async def test_strips_surrounding_whitespace_from_rewritten_question() -> None:
    model = _mock_chat_model("  로그인 API 구현 업무의 마감일은?  \n")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch, chat_patch:
        result = await rewrite_question(_HISTORY, "그 업무는 언제까지야?")

    assert result == "로그인 API 구현 업무의 마감일은?"


@pytest.mark.asyncio
async def test_uses_low_temperature_for_deterministic_rewrite() -> None:
    model = _mock_chat_model("재작성 결과")
    endpoint_patch, chat_patch = _patched(model)

    with endpoint_patch as mock_endpoint, chat_patch:
        await rewrite_question(_HISTORY, "질문")

    assert mock_endpoint.call_args.kwargs["temperature"] == 0.1
