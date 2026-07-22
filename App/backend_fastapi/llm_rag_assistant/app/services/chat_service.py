from __future__ import annotations

from llm_rag_assistant.app.schema.chat_schema import RagQueryResponse, RagSource
from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.generation_service import generate_answer
from llm_rag_assistant.app.services.retrieval_service import search_similar_chunks

_SNIPPET_MAX_LEN = 200

# "내 할 일 알려줘" 류 개인화 질문 판별용. 순수 벡터 유사도만으로는 "내"가 누구인지 구분할
# 수 없어 (일반 문구라 특정 담당자 청크와 유사도가 두드러지지 않음) 키워드로 의도를 감지해
# assignee_id 필터 검색으로 전환한다.
# 부분 문자열로 비교하면 "문제 ", "과제 ", "안내 " 같은 무관한 단어에 "제 "가 포함돼 오탐한다
# (예: "이 문제 알려줘"가 개인화 질문으로 잘못 분류됨) - 공백으로 나눈 토큰 단위로 정확히
# 일치할 때만 개인화 의도로 판단한다.
_PERSONAL_INTENT_TOKENS = {"내가", "제가", "나의", "저의", "나한테", "저한테", "내", "제"}


def _is_personal_intent(question: str) -> bool:
    return bool(_PERSONAL_INTENT_TOKENS & set(question.split()))


async def answer_question(pool, project_id: int, question: str, user_id: int | None = None) -> RagQueryResponse:
    query_embedding = await embed_text(question)
    assignee_id = user_id if user_id is not None and _is_personal_intent(question) else None
    rows = await search_similar_chunks(pool, project_id, query_embedding, top_k=5, assignee_id=assignee_id)
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
