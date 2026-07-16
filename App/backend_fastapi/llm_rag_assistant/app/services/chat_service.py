from __future__ import annotations

from llm_rag_assistant.app.schema.chat_schema import RagQueryResponse, RagSource
from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.generation_service import generate_answer
from llm_rag_assistant.app.services.retrieval_service import search_similar_chunks

_SNIPPET_MAX_LEN = 200


async def answer_question(pool, project_id: int, question: str) -> RagQueryResponse:
    query_embedding = await embed_text(question)
    rows = await search_similar_chunks(pool, project_id, query_embedding, top_k=5)
    answer = await generate_answer(question, rows)

    sources = [
        RagSource(
            source_type=row["source_type"],
            source_id=row["source_id"],
            content_snippet=_shorten(row["content"], _SNIPPET_MAX_LEN),
            similarity=row["similarity"],
        )
        for row in rows
    ]
    return RagQueryResponse(answer=answer, sources=sources)


def _shorten(value: str, max_len: int) -> str:
    return value if len(value) <= max_len else value[: max_len - 1] + "…"
