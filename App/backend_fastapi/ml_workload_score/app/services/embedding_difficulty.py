from __future__ import annotations

import asyncio
import logging
import os

import ollama
from dotenv import dotenv_values
from langsmith import traceable
from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine
from llm_rag_assistant.app.services.vector_utils import to_vector_literal

logger = logging.getLogger(__name__)

# workload_db.py와 동일한 패턴 - core.config.get_settings()는 이 dev 환경에서
# App/.env를 못 찾아 ValidationError가 나는 게 확인됨(cwd 기반 탐색이라 상위 디렉터리를
# 안 훑음). embed_text()도 내부에서 get_settings()를 쓰므로 재사용하지 않고 직접 호출한다.
_env = {**dotenv_values(), **os.environ}
OLLAMA_HOST = _env.get("OLLAMA_HOST", "http://localhost:11434")
# 주의: 이 모델은 FS-4 ingestion 파이프라인이 document_chunks를 채울 때 쓰는 임베딩
# 모델과 반드시 동일해야 한다(현재 둘 다 기본값 nomic-embed-text). 서로 달라지면
# 코사인 유사도 비교 자체가 의미 없어지는데, 이를 감지해 에러를 내는 장치는 없다.
EMBEDDING_MODEL = _env.get("EMBEDDING_MODEL", "nomic-embed-text")

HARD_ANCHOR = "복잡하고 어려운 고난이도 기술 업무. 설계와 문제 해결이 까다롭고 전문성이 필요하다."
EASY_ANCHOR = "단순하고 쉬운 반복 업무. 절차가 명확하고 빠르게 처리할 수 있다."
EMBEDDING_DIFFICULTY_WEIGHT = 0.3

_anchor_cache: dict[str, list[float]] = {}


def _summarize_embed_inputs(inputs: dict) -> dict:
    """LangSmith 트레이스에 원본 텍스트(text_value) 전체 대신 글자 수만 기록한다.

    process_inputs가 없으면 @traceable이 함수 인자를 가공 없이 그대로 로깅하므로,
    이 함수를 앵커 문자열이 아닌 실제 업무 원문으로 호출하는 경로가 생기더라도
    본문이 외부(LangSmith)로 그대로 전송되지 않도록 처음부터 방어한다
    (리뷰 지적사항 - 현재는 HARD_ANCHOR/EASY_ANCHOR 고정 문자열로만 호출되지만,
    _embed는 임의 텍스트를 받는 범용 함수라 이 보장이 함수 시그니처만으론 드러나지 않는다)."""
    text_value = inputs.get("text_value") or ""
    return {"text_length": len(text_value)}


def _summarize_embed_outputs(outputs: list[float]) -> dict:
    """LangSmith 트레이스에 임베딩 벡터 원본 전체 대신 차원 수만 기록한다."""
    return {"embedding_dim": len(outputs)}


@traceable(
    run_type="llm",
    name="ollama_embed",
    process_inputs=_summarize_embed_inputs,
    process_outputs=_summarize_embed_outputs,
)
async def _embed(text_value: str) -> list[float]:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.embeddings(model=EMBEDDING_MODEL, prompt=text_value)
    return response["embedding"]


def _summarize_get_anchor_embeddings_outputs(outputs: tuple[list[float], list[float]]) -> dict:
    """LangSmith 트레이스에 HARD/EASY 앵커 임베딩 벡터 원본 전체 대신 차원 수만 기록한다."""
    hard, easy = outputs
    return {"hard_dim": len(hard), "easy_dim": len(easy)}


@traceable(
    run_type="chain",
    name="get_anchor_embeddings",
    process_outputs=_summarize_get_anchor_embeddings_outputs,
)
async def get_anchor_embeddings() -> tuple[list[float], list[float]]:
    """HARD/EASY 앵커 임베딩을 프로세스당 한 번만 계산해 캐싱한다."""
    if "hard" not in _anchor_cache:
        _anchor_cache["hard"] = await _embed(HARD_ANCHOR)
    if "easy" not in _anchor_cache:
        _anchor_cache["easy"] = await _embed(EASY_ANCHOR)
    return _anchor_cache["hard"], _anchor_cache["easy"]


_SIMILARITY_QUERY = text("""
    SELECT source_id,
           1 - (embedding <=> :hard_anchor ::vector) AS sim_hard,
           1 - (embedding <=> :easy_anchor ::vector) AS sim_easy
    FROM document_chunks
    WHERE project_id = :project_id
      AND source_type = 'task'
      AND source_id = ANY(:task_ids)
""")


def _query_similarity_adjustments(
    hard_vec: list[float],
    easy_vec: list[float],
    project_id: int,
    task_ids: list[int],
) -> dict[int, float]:
    """
    동기 SQLAlchemy 조회 + 결과 dict 변환을 한데 묶은 헬퍼.
    asyncio.to_thread로 스레드풀에서 실행하기 위해 분리했다 - 이벤트 루프를
    블로킹하지 않기 위함. 이 함수 내부에서 일어나는 모든 실패(조회 실패,
    row 데이터 이상 등)는 호출 측(compute_embedding_adjustments)의 try/except가
    잡아서 빈 dict로 처리한다.
    """
    engine = None
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                _SIMILARITY_QUERY,
                {
                    "hard_anchor": to_vector_literal(hard_vec),
                    "easy_anchor": to_vector_literal(easy_vec),
                    "project_id": project_id,
                    "task_ids": task_ids,
                },
            ).mappings().all()
        return {
            row["source_id"]: (row["sim_hard"] - row["sim_easy"]) * EMBEDDING_DIFFICULTY_WEIGHT
            for row in rows
        }
    finally:
        if engine is not None:
            engine.dispose()


def _summarize_compute_embedding_adjustments_inputs(inputs: dict) -> dict:
    """LangSmith 트레이스에 task_ids 전체 목록 대신 개수/project_id만 기록한다."""
    task_ids = inputs.get("task_ids") or []
    return {
        "task_ids_count": len(task_ids),
        "project_id": inputs.get("project_id"),
    }


def _summarize_compute_embedding_adjustments_outputs(outputs: dict[int, float]) -> dict:
    """LangSmith 트레이스에 task_id별 보정치 전체 dict 대신 개수/최솟값/최댓값만 기록한다."""
    values = list(outputs.values())
    return {
        "adjustments_count": len(outputs),
        "adjustments_min": min(values) if values else None,
        "adjustments_max": max(values) if values else None,
    }


@traceable(
    run_type="chain",
    name="compute_embedding_adjustments",
    process_inputs=_summarize_compute_embedding_adjustments_inputs,
    process_outputs=_summarize_compute_embedding_adjustments_outputs,
)
async def compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]:
    """
    document_chunks에 이미 임베딩된 task만 대상으로 난이도 보정치를 계산한다.
    (source_id -> (sim_hard - sim_easy) * EMBEDDING_DIFFICULTY_WEIGHT)
    임베딩이 없는 task_id는 결과에서 빠진다 - 호출 측(build_features)에서
    .get(task_id, 0.0)으로 처리되므로 오늘과 동일하게 동작한다.
    Ollama 실패 등 어떤 이유로든 계산에 실패하면 빈 dict를 반환한다 - 이 보강 신호 하나
    때문에 워크로드 스코어 전체가 실패하면 안 되기 때문.
    """
    if not task_ids:
        return {}

    try:
        hard_vec, easy_vec = await get_anchor_embeddings()
    except Exception:
        logger.warning("임베딩 난이도 보정 계산 실패(앵커 임베딩) - 보정 없이 진행", exc_info=True)
        return {}

    try:
        return await asyncio.to_thread(
            _query_similarity_adjustments, hard_vec, easy_vec, project_id, task_ids
        )
    except Exception:
        logger.warning("임베딩 난이도 보정 계산 실패(document_chunks 조회) - 보정 없이 진행", exc_info=True)
        return {}
