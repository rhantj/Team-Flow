from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.services import ingestion_service
from llm_rag_assistant.app.services.ingestion_service import ingest_content, sync_assignee


class _FakeConn:
    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.executed: list[tuple] = []
        self._next_id = 1
        self.transaction_entries = 0

    async def fetchrow(self, query: str, *args):
        self.calls.append((query, args))
        row = {"id": self._next_id}
        self._next_id += 1
        return row

    async def execute(self, query: str, *args):
        self.executed.append((query, args))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def transaction(self):
        connection = self

        class _Transaction:
            async def __aenter__(self):
                connection.transaction_entries += 1

            async def __aexit__(self, *exc):
                return False

        return _Transaction()


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self):
        return self._conn


@pytest.fixture(autouse=True)
def cache_epoch_advance():
    with patch("core.cache.advance_rag_project_epoch", new=AsyncMock()) as advance:
        yield advance


@pytest.mark.asyncio
async def test_ingest_content_chunks_embeds_and_inserts_each_chunk(cache_epoch_advance) -> None:
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
    assert args[5] is None
    lock_query, lock_args = conn.executed[0]
    assert "pg_advisory_xact_lock" in lock_query
    assert lock_args == ("project:1",)
    delete_query, delete_args = conn.executed[1]
    assert "DELETE FROM document_chunks" in delete_query
    assert delete_args == (1, "meeting", 42)
    assert conn.transaction_entries == 1
    assert cache_epoch_advance.await_args_list == [
        ((1,), {}),
        ((1,), {}),
    ]


@pytest.mark.asyncio
async def test_ingest_content_stores_assignee_id_when_given() -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    with patch(
        "llm_rag_assistant.app.services.ingestion_service.embed_text",
        new=AsyncMock(return_value=[0.1]),
    ):
        await ingest_content(
            pool, project_id=1, source_type="task", source_id=7, content="업무 내용", assignee_id=42
        )

    _, args = conn.calls[0]
    assert args[5] == 42


@pytest.mark.asyncio
async def test_sync_assignee_updates_existing_chunks_without_reembedding() -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    await sync_assignee(pool, project_id=1, source_type="task", source_id=7, assignee_id=99)

    assert len(conn.executed) == 2
    assert "pg_advisory_xact_lock" in conn.executed[0][0]
    query, args = conn.executed[1]
    assert "UPDATE document_chunks" in query
    assert "SET assignee_id" in query
    assert args == (99, 1, "task", 7)


@pytest.mark.asyncio
async def test_sync_assignee_can_clear_assignee_to_none() -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    await sync_assignee(pool, project_id=1, source_type="task", source_id=7, assignee_id=None)

    _, args = conn.executed[1]
    assert args[0] is None


@pytest.mark.asyncio
async def test_ingest_content_blank_content_removes_existing_source(cache_epoch_advance) -> None:
    conn = _FakeConn()
    pool = _FakePool(conn)

    result = await ingest_content(pool, project_id=1, source_type="task", source_id=1, content="   ")

    assert result.chunk_ids == []
    assert result.chunk_count == 0
    assert conn.calls == []
    assert "DELETE FROM document_chunks" in conn.executed[1][0]
    assert conn.executed[1][1] == (1, "task", 1)
    assert cache_epoch_advance.await_count == 2


@pytest.mark.asyncio
async def test_delete_source_removes_only_matching_project_source(cache_epoch_advance) -> None:
    conn = _FakeConn()

    await ingestion_service.delete_source(
        _FakePool(conn),
        project_id=3,
        source_type="meeting",
        source_id=7,
    )

    assert "pg_advisory_xact_lock" in conn.executed[0][0]
    assert "DELETE FROM document_chunks" in conn.executed[1][0]
    assert conn.executed[1][1] == (3, "meeting", 7)
    assert cache_epoch_advance.await_count == 2


@pytest.mark.asyncio
async def test_delete_project_sources_removes_all_project_chunks(cache_epoch_advance) -> None:
    conn = _FakeConn()

    await ingestion_service.delete_project_sources(_FakePool(conn), project_id=3)

    assert "pg_advisory_xact_lock" in conn.executed[0][0]
    assert "DELETE FROM document_chunks" in conn.executed[1][0]
    assert conn.executed[1][1] == (3,)
    assert cache_epoch_advance.await_count == 2
