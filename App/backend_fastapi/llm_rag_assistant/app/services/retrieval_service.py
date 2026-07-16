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


async def search_similar_chunks(
    pool, project_id: int, query_embedding: list[float], top_k: int = 5
) -> list[dict]:
    embedding_literal = to_vector_literal(query_embedding)
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_SQL, embedding_literal, project_id, top_k)
    return [dict(row) for row in rows]
