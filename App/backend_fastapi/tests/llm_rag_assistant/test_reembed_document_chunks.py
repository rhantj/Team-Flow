from __future__ import annotations

from unittest.mock import patch

import pytest

from llm_rag_assistant.scripts.reembed_document_chunks import reembed_all


class _FakeConn:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows
        self.executed: list[tuple] = []

    async def fetch(self, query: str) -> list[dict]:
        return self._rows

    async def execute(self, query: str, *args) -> None:
        self.executed.append(args)


class _FakeAcquireCtx:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    async def __aenter__(self) -> _FakeConn:
        return self._conn

    async def __aexit__(self, *exc) -> bool:
        return False


class _FakePool:
    def __init__(self, conn: _FakeConn) -> None:
        self._conn = conn

    def acquire(self) -> _FakeAcquireCtx:
        return _FakeAcquireCtx(self._conn)


@pytest.mark.asyncio
async def test_reembed_all_updates_every_row_with_new_embedding() -> None:
    rows = [{"id": 1, "content": "첫 번째 청크"}, {"id": 2, "content": "두 번째 청크"}]
    conn = _FakeConn(rows)
    pool = _FakePool(conn)

    async def fake_embed_text(text: str) -> list[float]:
        return [1.0, 2.0] if text == "첫 번째 청크" else [3.0, 4.0]

    with patch(
        "llm_rag_assistant.scripts.reembed_document_chunks.embed_text", new=fake_embed_text
    ):
        count = await reembed_all(pool)

    assert count == 2
    assert conn.executed == [
        ("[1.00000000,2.00000000]", 1),
        ("[3.00000000,4.00000000]", 2),
    ]


@pytest.mark.asyncio
async def test_reembed_all_returns_zero_when_no_rows() -> None:
    conn = _FakeConn([])
    pool = _FakePool(conn)

    count = await reembed_all(pool)

    assert count == 0
    assert conn.executed == []
