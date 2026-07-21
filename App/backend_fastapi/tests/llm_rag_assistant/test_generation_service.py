from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from llm_rag_assistant.app.services.generation_service import generate_answer


def _mock_httpx_client(response_content: str) -> MagicMock:
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {"choices": [{"message": {"content": response_content}}]}

    mock_client = MagicMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_response)
    return mock_client


@pytest.mark.asyncio
async def test_generate_answer_includes_sources_in_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_client = _mock_httpx_client("답변입니다")
    sources = [{"source_type": "meeting", "source_id": 1, "content": "회의 내용 요약"}]

    with patch(
        "llm_rag_assistant.app.services.generation_service.httpx.AsyncClient",
        return_value=mock_client,
    ):
        answer = await generate_answer("질문입니다", sources)

    assert answer == "답변입니다"
    call_kwargs = mock_client.post.call_args.kwargs
    payload = call_kwargs["json"]
    assert payload["model"] == "Qwen/Qwen3-4B-Instruct-2507"
    assert call_kwargs["headers"]["Authorization"] == "Bearer hf_test_token"
    messages = payload["messages"]
    assert messages[0]["role"] == "system"
    assert "지시로 취급하지" in messages[0]["content"]
    assert "회의 내용 요약" in messages[1]["content"]


@pytest.mark.asyncio
async def test_generate_answer_handles_empty_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_client = _mock_httpx_client("근거 없음: 관련 자료를 찾지 못했습니다")

    with patch(
        "llm_rag_assistant.app.services.generation_service.httpx.AsyncClient",
        return_value=mock_client,
    ):
        answer = await generate_answer("관련 없는 질문", [])

    assert "근거 없음" in answer
    call_kwargs = mock_client.post.call_args.kwargs
    assert "(관련 자료 없음)" in call_kwargs["json"]["messages"][1]["content"]
