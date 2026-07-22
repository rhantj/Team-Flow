from __future__ import annotations

from unittest.mock import AsyncMock, patch

import aiohttp
import pytest
import requests
from fastapi.testclient import TestClient

from app.main import app
from core.db import get_pool
from llm_rag_assistant.app.schema.chat_schema import RagQueryResponse, RagSource
from llm_rag_assistant.app.security import verify_internal_api_key


def _override_pool():
    async def _fake_pool():
        yield object()

    app.dependency_overrides[get_pool] = _fake_pool
    app.dependency_overrides[verify_internal_api_key] = lambda: None


def test_query_endpoint_returns_answer_with_sources() -> None:
    _override_pool()
    fake_result = RagQueryResponse(
        answer="답변",
        sources=[RagSource(source_type="meeting", source_id=1, content_snippet="요약", similarity=0.9)],
    )
    with patch(
        "llm_rag_assistant.app.routers.chat_router.answer_question",
        new=AsyncMock(return_value=fake_result),
    ) as mock_answer:
        client = TestClient(app)
        response = client.post("/ai/rag/query", json={"project_id": 1, "question": "질문"})

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["answer"] == "답변"
    mock_answer.assert_awaited_once()
    _, called_args, _ = mock_answer.mock_calls[0]
    assert called_args[1] == 1


def test_query_endpoint_returns_503_when_connection_fails() -> None:
    _override_pool()
    with patch(
        "llm_rag_assistant.app.routers.chat_router.answer_question",
        new=AsyncMock(side_effect=aiohttp.ClientConnectionError("connection refused")),
    ):
        client = TestClient(app)
        response = client.post("/ai/rag/query", json={"project_id": 1, "question": "질문"})

    app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json()["detail"] == {"error": "llm_unavailable"}


def test_different_project_ids_are_forwarded_unmodified_to_service() -> None:
    """교차 프로젝트 데이터 노출 방지 회귀 테스트: project_id가 라우터에서
    변조되거나 무시되지 않고 그대로 서비스 계층에 전달되는지 확인한다."""
    _override_pool()
    fake_result = RagQueryResponse(answer="답변", sources=[])

    for project_id in (1, 2, 999):
        with patch(
            "llm_rag_assistant.app.routers.chat_router.answer_question",
            new=AsyncMock(return_value=fake_result),
        ) as mock_answer:
            client = TestClient(app)
            client.post("/ai/rag/query", json={"project_id": project_id, "question": "질문"})
            _, called_args, _ = mock_answer.mock_calls[0]
            assert called_args[1] == project_id

    app.dependency_overrides.clear()


def test_query_endpoint_returns_503_when_huggingface_returns_http_error() -> None:
    _override_pool()
    with patch(
        "llm_rag_assistant.app.routers.chat_router.answer_question",
        new=AsyncMock(side_effect=requests.exceptions.HTTPError("503 Service Unavailable")),
    ):
        client = TestClient(app)
        response = client.post("/ai/rag/query", json={"project_id": 1, "question": "질문"})

    app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json()["detail"] == {"error": "llm_unavailable"}
