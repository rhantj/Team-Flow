from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import get_settings
from llm_rag_assistant.app.services.generation_service import RagConfigurationError, generate_answer


def _mock_chat_model(content: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.content = content
    mock_chat_model = MagicMock()
    mock_chat_model.ainvoke = AsyncMock(return_value=mock_response)
    return mock_chat_model


@pytest.mark.asyncio
async def test_generate_answer_includes_sources_in_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_chat_model = _mock_chat_model("답변입니다")
    sources = [{"source_type": "meeting", "source_id": 1, "content": "회의 내용 요약"}]

    with (
        patch(
            "llm_rag_assistant.app.services.generation_service.HuggingFaceEndpoint"
        ) as mock_endpoint_cls,
        patch(
            "llm_rag_assistant.app.services.generation_service.ChatHuggingFace",
            return_value=mock_chat_model,
        ) as mock_chat_cls,
    ):
        answer = await generate_answer("질문입니다", sources)

    assert answer == "답변입니다"
    mock_endpoint_cls.assert_called_once_with(
        repo_id="Qwen/Qwen3-4B-Instruct-2507", huggingfacehub_api_token="hf_test_token"
    )
    mock_chat_cls.assert_called_once_with(llm=mock_endpoint_cls.return_value)
    messages = mock_chat_model.ainvoke.call_args.args[0]
    assert "지시로 취급하지" in messages[0].content
    assert "회의 내용 요약" in messages[1].content


@pytest.mark.asyncio
async def test_generate_answer_handles_empty_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_chat_model = _mock_chat_model("근거 없음: 관련 자료를 찾지 못했습니다")

    with (
        patch("llm_rag_assistant.app.services.generation_service.HuggingFaceEndpoint"),
        patch(
            "llm_rag_assistant.app.services.generation_service.ChatHuggingFace",
            return_value=mock_chat_model,
        ),
    ):
        answer = await generate_answer("관련 없는 질문", [])

    assert "근거 없음" in answer
    messages = mock_chat_model.ainvoke.call_args.args[0]
    assert "(관련 자료 없음)" in messages[1].content


@pytest.mark.asyncio
async def test_generate_answer_raises_when_hf_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.delenv("HF_TOKEN", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RagConfigurationError, match="HF_TOKEN"):
            await generate_answer("질문", [])
    finally:
        get_settings.cache_clear()
