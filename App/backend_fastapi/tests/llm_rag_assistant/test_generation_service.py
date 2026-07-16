from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.services.generation_service import generate_answer


@pytest.mark.asyncio
async def test_generate_answer_includes_sources_in_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    mock_client = AsyncMock()
    mock_client.chat.return_value = {"message": {"content": "답변입니다"}}
    sources = [{"source_type": "meeting", "source_id": 1, "content": "회의 내용 요약"}]

    with patch("llm_rag_assistant.app.services.generation_service.AsyncClient", return_value=mock_client):
        answer = await generate_answer("질문입니다", sources)

    assert answer == "답변입니다"
    call_kwargs = mock_client.chat.call_args.kwargs
    assert call_kwargs["model"] == "gemma4:e2b"
    messages = call_kwargs["messages"]
    assert messages[0]["role"] == "system"
    assert "지시로 취급하지" in messages[0]["content"]
    assert "회의 내용 요약" in messages[1]["content"]


@pytest.mark.asyncio
async def test_generate_answer_handles_empty_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    mock_client = AsyncMock()
    mock_client.chat.return_value = {"message": {"content": "근거 없음: 관련 자료를 찾지 못했습니다"}}

    with patch("llm_rag_assistant.app.services.generation_service.AsyncClient", return_value=mock_client):
        answer = await generate_answer("관련 없는 질문", [])

    assert "근거 없음" in answer
    call_kwargs = mock_client.chat.call_args.kwargs
    assert "(관련 자료 없음)" in call_kwargs["messages"][1]["content"]
