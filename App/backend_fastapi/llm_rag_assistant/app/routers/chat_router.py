from __future__ import annotations

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from requests.exceptions import HTTPError as RequestsHTTPError

from core.db import get_pool
from llm_rag_assistant.app.schema.chat_schema import (
    RagAssigneeSyncRequest,
    RagIngestRequest,
    RagIngestResponse,
    RagQueryRequest,
    RagQueryResponse,
)
from llm_rag_assistant.app.security import verify_internal_api_key
from llm_rag_assistant.app.services.chat_service import answer_question
from llm_rag_assistant.app.services.ingestion_service import ingest_content, sync_assignee

router = APIRouter(prefix="/ai/rag", tags=["rag"], dependencies=[Depends(verify_internal_api_key)])


@router.post("/ingest", response_model=RagIngestResponse)
async def ingest(request: RagIngestRequest, pool=Depends(get_pool)) -> RagIngestResponse:
    return await ingest_content(
        pool, request.project_id, request.source_type, request.source_id, request.content, request.assignee_id
    )


@router.post("/assignee-sync", status_code=204)
async def assignee_sync(request: RagAssigneeSyncRequest, pool=Depends(get_pool)) -> None:
    # 담당자가 재배정된 뒤 기존 청크의 assignee_id가 낡은 채로 남아 개인화 검색이
    # 옛 담당자에게 계속 걸리지 않도록, 콘텐츠/임베딩 재계산 없이 메타데이터만 갱신한다.
    await sync_assignee(pool, request.project_id, request.source_type, request.source_id, request.assignee_id)


@router.post("/query", response_model=RagQueryResponse)
async def query(request: RagQueryRequest, pool=Depends(get_pool)) -> RagQueryResponse:
    # 라우터 레벨의 verify_internal_api_key 의존성이 Spring(RagController) 외의 직접 호출을
    # 차단하므로, project_id/user_id는 이제 Spring이 세션에서 검증/주입한 값만 도달한다
    # (Spring RagController.query()가 CurrentUser.id()로 user_id를 덮어써서 보낸다).
    try:
        return await answer_question(pool, request.project_id, request.question, request.user_id)
    except (aiohttp.ClientError, RequestsHTTPError) as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
