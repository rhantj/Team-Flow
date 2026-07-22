"""
document_chunks.assignee_id 컬럼 추가 이후, 이미 인제스트돼 있던 기존 행들의
assignee_id를 tasks/meeting_action_items에서 조인해 채워 넣는 일회성 스크립트.

이 스크립트를 실행하기 전에 반드시 아래 DDL로 컬럼을 먼저 추가해야 한다
(이 스크립트는 스키마를 바꾸지 않는다):

    ALTER TABLE document_chunks ADD COLUMN assignee_id BIGINT NULL;

실행:
    cd App/backend_fastapi
    python -m llm_rag_assistant.scripts.backfill_assignee_ids
"""

from __future__ import annotations

import asyncio

import asyncpg

from core.db import create_pool

_UPDATE_TASK_ASSIGNEES_SQL = """
UPDATE document_chunks dc
SET assignee_id = t.assignee_id
FROM tasks t
WHERE dc.source_type = 'task' AND dc.source_id = t.id AND dc.assignee_id IS DISTINCT FROM t.assignee_id
"""

_UPDATE_ACTION_ITEM_ASSIGNEES_SQL = """
UPDATE document_chunks dc
SET assignee_id = ai.final_assignee_id
FROM meeting_action_items ai
WHERE dc.source_type = 'action_item' AND dc.source_id = ai.id
      AND dc.assignee_id IS DISTINCT FROM ai.final_assignee_id
"""


async def backfill_assignee_ids(pool: asyncpg.Pool) -> tuple[int, int]:
    async with pool.acquire() as conn:
        task_result = await conn.execute(_UPDATE_TASK_ASSIGNEES_SQL)
        action_item_result = await conn.execute(_UPDATE_ACTION_ITEM_ASSIGNEES_SQL)
    return _updated_count(task_result), _updated_count(action_item_result)


def _updated_count(execute_result: str) -> int:
    # asyncpg의 Connection.execute()는 "UPDATE 3" 같은 명령 태그 문자열을 반환한다.
    return int(execute_result.split()[-1])


async def main() -> None:
    pool = await create_pool()
    try:
        task_count, action_item_count = await backfill_assignee_ids(pool)
    finally:
        await pool.close()
    print(f"task assignee_id 백필: {task_count}건")
    print(f"action_item assignee_id 백필: {action_item_count}건")


if __name__ == "__main__":
    asyncio.run(main())
