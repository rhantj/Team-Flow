from __future__ import annotations

from llm_rag_assistant.app.services.vector_utils import to_vector_literal

_SEARCH_SQL = """
SELECT source_type, source_id, content,
       1 - (embedding <=> $1::vector) AS similarity
FROM document_chunks
WHERE project_id = $2
ORDER BY embedding <=> $1::vector
LIMIT $3
"""

_SEARCH_BY_TYPE_SQL = """
SELECT source_type, source_id, content,
       1 - (embedding <=> $1::vector) AS similarity
FROM document_chunks
WHERE project_id = $2 AND source_type = $3
ORDER BY embedding <=> $1::vector
LIMIT $4
"""

_SEARCH_BY_ASSIGNEE_SQL = """
SELECT source_type, source_id, content,
       1 - (embedding <=> $1::vector) AS similarity
FROM document_chunks
WHERE project_id = $2 AND assignee_id = $3
ORDER BY embedding <=> $1::vector
LIMIT $4
"""

# 업무 코드(WF-195 등)는 별도 컬럼이 아니라 content 본문 토큰이다. 임베딩 유사도로는
# 제목이 비슷한 다른 업무에 밀려 정확히 못 잡으므로, 코드가 명시되면 본문에서 그 토큰을
# 단어 경계로 정확히 찾는다. 뒤 경계를 [^0-9]로 잡아 WF-195가 WF-1950에 걸리지 않게 한다.
_SEARCH_BY_TASK_CODE_SQL = """
SELECT source_type, source_id, content
FROM document_chunks
WHERE project_id = $1 AND source_type = 'task'
  AND content ~* ('(^|[^0-9A-Za-z])' || $2 || '([^0-9]|$)')
LIMIT $3
"""

MEETING_SOURCE_TYPE = "meeting"
# task/action_item 청크 수가 meeting보다 훨씬 많아 일반 유사도 검색에서 meeting이
# 밀려나는 경우가 잦다. meeting 청크가 하나도 안 뽑혔을 때만 별도로 최소 슬롯을 예약한다.
MEETING_MIN_RESERVED = 2


async def find_task_chunks_by_code(
    pool, project_id: int, code: str, limit: int = 6
) -> list[dict]:
    """업무 코드가 본문에 들어 있는 task 청크를 정확히(단어 경계) 찾는다.

    호출 측에서 code는 [A-Za-z]{2,}-\\d+ 형태로 검증돼 넘어와야 한다(정규식 메타문자 없음).
    """
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_BY_TASK_CODE_SQL, project_id, code, limit)
    return [dict(row) for row in rows]


async def search_similar_chunks(
    pool, project_id: int, query_embedding: list[float], top_k: int = 5, assignee_id: int | None = None
) -> list[dict]:
    embedding_literal = to_vector_literal(query_embedding)

    if assignee_id is not None:
        # 담당 업무가 하나도 없어도 프로젝트 전체 검색으로 대체하지 않는다. 대체하면 다른
        # 사람의 업무가 컨텍스트에 섞여, LLM이 그걸 질문자 본인의 담당 업무처럼 답할 위험이
        # 있다 (개인화 질문에서는 정확한 "없음"이 잘못된 "있음"보다 안전하다).
        async with pool.acquire() as conn:
            assignee_rows = await conn.fetch(_SEARCH_BY_ASSIGNEE_SQL, embedding_literal, project_id, assignee_id, top_k)
        return [dict(row) for row in assignee_rows]

    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_SQL, embedding_literal, project_id, top_k)
        general = [dict(row) for row in rows]

        has_meeting = any(row["source_type"] == MEETING_SOURCE_TYPE for row in general)
        if has_meeting or top_k <= 0:
            return general

        reserved = min(MEETING_MIN_RESERVED, top_k)
        meeting_rows = await conn.fetch(
            _SEARCH_BY_TYPE_SQL, embedding_literal, project_id, MEETING_SOURCE_TYPE, reserved
        )
        meeting = [dict(row) for row in meeting_rows]

    if not meeting:
        return general

    slots_for_meeting = min(len(meeting), top_k)
    combined = general[: top_k - slots_for_meeting] + meeting[:slots_for_meeting]
    combined.sort(key=lambda row: row["similarity"], reverse=True)
    return combined
