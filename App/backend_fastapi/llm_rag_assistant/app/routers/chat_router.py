from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException

from core.db import get_pool
from llm_rag_assistant.app.schema.chat_schema import (
    RagIngestRequest,
    RagIngestResponse,
    RagQueryRequest,
    RagQueryResponse,
)
from llm_rag_assistant.app.services.chat_service import answer_question
from llm_rag_assistant.app.services.ingestion_service import ingest_content

router = APIRouter(prefix="/ai/rag", tags=["rag"])


@router.post("/ingest", response_model=RagIngestResponse)
async def ingest(request: RagIngestRequest, pool=Depends(get_pool)) -> RagIngestResponse:
    return await ingest_content(
        pool, request.project_id, request.source_type, request.source_id, request.content
    )


@router.post("/query", response_model=RagQueryResponse)
async def query(request: RagQueryRequest, pool=Depends(get_pool)) -> RagQueryResponse:
    # TODO(FS-1 인증 연동 후): project_id를 요청 그대로 신뢰하지 말고
    # 실제 세션의 프로젝트 멤버십을 검증하도록 교체할 것 (보안 고려사항 #1)
    try:
        return await answer_question(pool, request.project_id, request.question)
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
