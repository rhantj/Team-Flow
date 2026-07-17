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


class _FakeSequenceConn:
    """호출 순서대로 다른 결과를 반환하는 fake conn (일반 검색 → 타입별 예약 검색 순서 검증용)."""

    def __init__(self, responses: list[list[dict]]) -> None:
        self._responses = responses
        self.calls: list[tuple] = []

    async def fetch(self, query: str, *args):
        self.calls.append((query, args))
        index = len(self.calls) - 1
        return self._responses[index]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeSequencePool:
    def __init__(self, conn: _FakeSequenceConn) -> None:
        self._conn = conn

    def acquire(self):
        return self._conn


@pytest.mark.asyncio
async def test_search_reserves_meeting_slots_when_general_search_finds_none() -> None:
    general_rows = [
        {"source_type": "task", "source_id": 1, "content": "업무1", "similarity": 0.9},
        {"source_type": "action_item", "source_id": 2, "content": "액션1", "similarity": 0.85},
        {"source_type": "task", "source_id": 3, "content": "업무2", "similarity": 0.8},
        {"source_type": "action_item", "source_id": 4, "content": "액션2", "similarity": 0.75},
        {"source_type": "task", "source_id": 5, "content": "업무3", "similarity": 0.7},
    ]
    meeting_rows = [
        {"source_type": "meeting", "source_id": 10, "content": "회의 요약", "similarity": 0.6},
    ]
    conn = _FakeSequenceConn([general_rows, meeting_rows])
    pool = _FakeSequencePool(conn)

    result = await search_similar_chunks(pool, project_id=1, query_embedding=[0.1], top_k=5)

    assert len(conn.calls) == 2
    assert any(row["source_type"] == "meeting" for row in result)
    assert len(result) == 5


@pytest.mark.asyncio
async def test_search_does_not_reserve_meeting_slots_when_already_present() -> None:
    general_rows = [
        {"source_type": "meeting", "source_id": 1, "content": "회의 요약", "similarity": 0.9},
        {"source_type": "task", "source_id": 2, "content": "업무1", "similarity": 0.8},
    ]
    conn = _FakeSequenceConn([general_rows])
    pool = _FakeSequencePool(conn)

    result = await search_similar_chunks(pool, project_id=1, query_embedding=[0.1], top_k=5)

    assert len(conn.calls) == 1
    assert result == general_rows


@pytest.mark.asyncio
async def test_search_skips_reservation_when_no_meeting_chunks_exist_at_all() -> None:
    general_rows = [
        {"source_type": "task", "source_id": 1, "content": "업무1", "similarity": 0.9},
    ]
    conn = _FakeSequenceConn([general_rows, []])
    pool = _FakeSequencePool(conn)

    result = await search_similar_chunks(pool, project_id=1, query_embedding=[0.1], top_k=5)

    assert len(conn.calls) == 2
    assert result == general_rows
