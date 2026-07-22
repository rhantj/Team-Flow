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
from llm_rag_assistant.app.services.generation_service import RagConfigurationError
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
    except (aiohttp.ClientError, RequestsHTTPError) as exc:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
    except RagConfigurationError as exc:
        # HF_TOKEN 미설정 등 generate_answer의 설정 오류는 LLM 연결 실패와 마찬가지로
        # 클라이언트 입장에선 "지금은 답변 불가"이므로 503으로 응답한다. 그 외 RuntimeError는
        # 실제 코드 결함일 수 있으므로 여기서 잡지 않고 500으로 그대로 드러낸다.
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
