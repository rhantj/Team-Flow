from __future__ import annotations

from llm_rag_assistant.app.schema.chat_schema import RagIngestResponse
from llm_rag_assistant.app.services.chunking import chunk_text
from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.vector_utils import to_vector_literal

_INSERT_CHUNK_SQL = """
INSERT INTO document_chunks (project_id, source_type, source_id, content, embedding)
VALUES ($1, $2, $3, $4, $5::vector)
RETURNING id
"""


async def ingest_content(
    pool, project_id: int, source_type: str, source_id: int, content: str
) -> RagIngestResponse:
    chunks = chunk_text(content)
    if not chunks:
        return RagIngestResponse(chunk_ids=[], chunk_count=0)

    chunk_ids: list[int] = []
    async with pool.acquire() as conn:
        for chunk in chunks:
            embedding = await embed_text(chunk)
            row = await conn.fetchrow(
                _INSERT_CHUNK_SQL,
                project_id,
                source_type,
                source_id,
                chunk,
                to_vector_literal(embedding),
            )
            chunk_ids.append(row["id"])

    return RagIngestResponse(chunk_ids=chunk_ids, chunk_count=len(chunk_ids))
