from __future__ import annotations

import pytest

from llm_rag_assistant.app.services.retrieval_service import search_similar_chunks


class _FakeConn:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self.calls: list[tuple] = []

    async def fetch(self, query: str, *args):
        self.calls.append((query, args))
        return self._rows

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
async def test_search_uses_bound_parameters_not_string_concatenation() -> None:
    rows = [{"source_type": "meeting", "source_id": 1, "content": "내용", "similarity": 0.9}]
    conn = _FakeConn(rows)
    pool = _FakePool(conn)

    result = await search_similar_chunks(pool, project_id=7, query_embedding=[0.1, 0.2], top_k=5)

    assert result == rows
    query, args = conn.calls[0]
    # project_id, top_k가 SQL 문자열에 직접 삽입되지 않고 바인딩 파라미터로만 전달되는지 검증
    assert "7" not in query
    assert args == ("[0.10000000,0.20000000]", 7, 5)


@pytest.mark.asyncio
async def test_search_filters_by_project_id_parameter() -> None:
    conn = _FakeConn([])
    pool = _FakePool(conn)

    await search_similar_chunks(pool, project_id=99, query_embedding=[0.5], top_k=3)

    _, args = conn.calls[0]
    assert args[1] == 99
