from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from core.db import get_pool
from llm_rag_assistant.app.schema.chat_schema import RagIngestResponse


def test_ingest_endpoint_returns_chunk_ids() -> None:
    async def _fake_pool():
        yield object()

    app.dependency_overrides[get_pool] = _fake_pool

    fake_result = RagIngestResponse(chunk_ids=[1, 2], chunk_count=2)
    with patch(
        "llm_rag_assistant.app.routers.chat_router.ingest_content",
        new=AsyncMock(return_value=fake_result),
    ):
        client = TestClient(app)
        response = client.post(
            "/ai/rag/ingest",
            json={
                "project_id": 1,
                "source_type": "meeting",
                "source_id": 10,
                "content": "회의록 텍스트",
            },
        )

    app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() == {"chunk_ids": [1, 2], "chunk_count": 2}


def test_assignee_sync_endpoint_calls_sync_assignee_with_request_fields() -> None:
    async def _fake_pool():
        yield object()

    app.dependency_overrides[get_pool] = _fake_pool

    with patch(
        "llm_rag_assistant.app.routers.chat_router.sync_assignee",
        new=AsyncMock(return_value=None),
    ) as mock_sync:
        client = TestClient(app)
        response = client.post(
            "/ai/rag/assignee-sync",
            json={"project_id": 1, "source_type": "task", "source_id": 7, "assignee_id": 99},
        )

    app.dependency_overrides.clear()
    assert response.status_code == 204
    _, called_args, _ = mock_sync.mock_calls[0]
    assert called_args[1:] == (1, "task", 7, 99)
