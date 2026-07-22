"""
기존 DB(meetings/meeting_analysis, meeting_action_items, tasks)에 이미 쌓여있던
레코드를 document_chunks로 백필 임베딩하는 스크립트.

새 레코드는 MeetingAnalysisService(Spring)가 생성 시점에 바로 RAG ingest를 호출하지만,
그 훅이 붙기 전부터 DB에 있던 기존 행들은 임베딩이 없다. 이 스크립트는 그 공백을 채운다.

실행:
    cd App/backend_fastapi
    python -m llm_rag_assistant.scripts.backfill_ingest
"""

from __future__ import annotations

import asyncio

import asyncpg

from core.db import create_pool
from llm_rag_assistant.app.services.ingestion_service import ingest_content

_ALREADY_INGESTED_SQL = """
SELECT 1 FROM document_chunks
WHERE project_id = $1 AND source_type = $2 AND source_id = $3
LIMIT 1
"""

_MEETINGS_SQL = """
SELECT m.id AS meeting_id, m.project_id, a.summary, a.decisions, a.risks
FROM meetings m
JOIN meeting_analysis a ON a.meeting_id = m.id
"""

_ACTION_ITEMS_SQL = """
SELECT ai.id, m.project_id, ai.title, ai.description, ai.basis, ai.final_assignee_id
FROM meeting_action_items ai
JOIN meetings m ON m.id = ai.meeting_id
"""

_TASKS_SQL = """
SELECT id, project_id, title, description, assignee_id
FROM tasks
"""


def _build_meeting_content(summary: str | None, decisions, risks) -> str:
    content = summary or ""
    if decisions:
        content += "\n결정사항: " + ", ".join(decisions)
    if risks:
        content += "\n위험요소: " + ", ".join(risks)
    return content.strip()


def _build_action_item_content(title: str, description: str | None, basis: str | None) -> str:
    content = title
    if description:
        content += f" - {description}"
    if basis:
        content += f"\n근거: {basis}"
    return content.strip()


def _build_task_content(title: str, description: str | None) -> str:
    content = title
    if description:
        content += f" - {description}"
    return content.strip()


async def _already_ingested(pool: asyncpg.Pool, project_id: int, source_type: str, source_id: int) -> bool:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_ALREADY_INGESTED_SQL, project_id, source_type, source_id)
    return row is not None


async def backfill_meetings(pool: asyncpg.Pool) -> int:
    count = 0
    async with pool.acquire() as conn:
        rows = await conn.fetch(_MEETINGS_SQL)
    for row in rows:
        content = _build_meeting_content(row["summary"], row["decisions"], row["risks"])
        if not content or await _already_ingested(pool, row["project_id"], "meeting", row["meeting_id"]):
            continue
        await ingest_content(pool, row["project_id"], "meeting", row["meeting_id"], content)
        count += 1
    return count


async def backfill_action_items(pool: asyncpg.Pool) -> int:
    count = 0
    async with pool.acquire() as conn:
        rows = await conn.fetch(_ACTION_ITEMS_SQL)
    for row in rows:
        content = _build_action_item_content(row["title"], row["description"], row["basis"])
        if not content or await _already_ingested(pool, row["project_id"], "action_item", row["id"]):
            continue
        await ingest_content(pool, row["project_id"], "action_item", row["id"], content, row["final_assignee_id"])
        count += 1
    return count


async def backfill_tasks(pool: asyncpg.Pool) -> int:
    count = 0
    async with pool.acquire() as conn:
        rows = await conn.fetch(_TASKS_SQL)
    for row in rows:
        content = _build_task_content(row["title"], row["description"])
        if not content or await _already_ingested(pool, row["project_id"], "task", row["id"]):
            continue
        await ingest_content(pool, row["project_id"], "task", row["id"], content, row["assignee_id"])
        count += 1
    return count


async def main() -> None:
    pool = await create_pool()
    try:
        meeting_count = await backfill_meetings(pool)
        action_item_count = await backfill_action_items(pool)
        task_count = await backfill_tasks(pool)
    finally:
        await pool.close()

    print(f"meeting 백필: {meeting_count}건")
    print(f"action_item 백필: {action_item_count}건")
    print(f"task 백필: {task_count}건")


if __name__ == "__main__":
    asyncio.run(main())
