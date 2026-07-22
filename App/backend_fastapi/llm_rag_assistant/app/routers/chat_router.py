from __future__ import annotations

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from requests.exceptions import HTTPError as RequestsHTTPError

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
        pool, request.project_id, request.source_type, request.source_id, request.content, request.assignee_id
    )


@router.post("/query", response_model=RagQueryResponse)
async def query(request: RagQueryRequest, pool=Depends(get_pool)) -> RagQueryResponse:
    # TODO(FS-1 인증 연동 후): project_id/user_id를 요청 그대로 신뢰하지 말고
    # 실제 세션의 프로젝트 멤버십 및 로그인 사용자와 검증하도록 교체할 것 (보안 고려사항 #1).
    # 지금은 Spring(RagController)이 user_id를 CurrentUser 세션에서 채워서 넘겨주지만,
    # 이 FastAPI 엔드포인트 자체는 Spring을 거치지 않고 직접 호출되면(docker-compose에 포트가
    # 열려 있음) project_id뿐 아니라 user_id도 그대로 신뢰한다 - 다른 사용자를 사칭해 그
    # 사람의 담당 업무를 조회할 수 있다. FastAPI를 내부 네트워크 전용으로 제한하거나
    # 서비스 간 공유 시크릿 검증을 추가하기 전까지는 이 경로를 신뢰 경계로 취급하지 말 것.
    try:
        return await answer_question(pool, request.project_id, request.question, request.user_id)
    except (aiohttp.ClientError, RequestsHTTPError) as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
