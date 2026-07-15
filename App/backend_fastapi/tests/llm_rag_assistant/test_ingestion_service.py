from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.services.ingestion_service import ingest_content


class _FakeConn:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self._next_id = 1

    async def fetchrow(self, query: str, *args):
        self.calls.append((query, args))
        row = {"id": self._next_id}
        self._next_id += 1
        return row

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self):
        return self._conn


@pytest.mark.asyncio
async def test_ingest_content_chunks_embeds_and_inserts_each_chunk() -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    with patch(
        "llm_rag_assistant.app.services.ingestion_service.embed_text",
        new=AsyncMock(return_value=[0.1, 0.2]),
    ) as mock_embed:
        result = await ingest_content(
            pool, project_id=1, source_type="meeting", source_id=42, content="회의록 내용"
        )

    assert result.chunk_count == 1
    assert result.chunk_ids == [1]
    mock_embed.assert_awaited_once_with("회의록 내용")
    query, args = conn.calls[0]
    assert "INSERT INTO document_chunks" in query
    assert args[0] == 1  # project_id
    assert args[1] == "meeting"
    assert args[2] == 42
    assert args[3] == "회의록 내용"
    assert args[4] == "[0.10000000,0.20000000]"


@pytest.mark.asyncio
async def test_ingest_content_returns_empty_result_for_blank_content() -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    result = await ingest_content(pool, project_id=1, source_type="task", source_id=1, content="   ")

    assert result.chunk_ids == []
    assert result.chunk_count == 0
    assert conn.calls == []
