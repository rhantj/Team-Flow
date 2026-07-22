from __future__ import annotations

import pytest

from llm_rag_assistant.scripts.backfill_assignee_ids import backfill_assignee_ids


class _FakeConn:
    def __init__(self, execute_results: list[str]) -> None:
        self._execute_results = execute_results
        self.executed: list[str] = []

    async def execute(self, query: str) -> str:
        self.executed.append(query)
        return self._execute_results[len(self.executed) - 1]


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
async def test_backfill_assignee_ids_parses_updated_row_counts_from_each_command_tag() -> None:
    conn = _FakeConn(["UPDATE 3", "UPDATE 5"])
    pool = _FakePool(conn)

    task_count, action_item_count = await backfill_assignee_ids(pool)

    assert task_count == 3
    assert action_item_count == 5
    assert len(conn.executed) == 2
    assert "tasks" in conn.executed[0]
    assert "meeting_action_items" in conn.executed[1]


@pytest.mark.asyncio
async def test_backfill_assignee_ids_returns_zero_when_nothing_updated() -> None:
    conn = _FakeConn(["UPDATE 0", "UPDATE 0"])
    pool = _FakePool(conn)

    task_count, action_item_count = await backfill_assignee_ids(pool)

    assert task_count == 0
    assert action_item_count == 0
