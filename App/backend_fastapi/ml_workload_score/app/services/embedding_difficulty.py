from __future__ import annotations

import logging
import os

import ollama
from dotenv import dotenv_values
from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine
from llm_rag_assistant.app.services.vector_utils import to_vector_literal

logger = logging.getLogger(__name__)

# workload_db.py와 동일한 패턴 - core.config.get_settings()는 이 dev 환경에서
# App/.env를 못 찾아 ValidationError가 나는 게 확인됨(cwd 기반 탐색이라 상위 디렉터리를
# 안 훑음). embed_text()도 내부에서 get_settings()를 쓰므로 재사용하지 않고 직접 호출한다.
_env = {**dotenv_values(), **os.environ}
OLLAMA_HOST = _env.get("OLLAMA_HOST", "http://localhost:11434")
EMBEDDING_MODEL = _env.get("EMBEDDING_MODEL", "nomic-embed-text")

HARD_ANCHOR = "복잡하고 어려운 고난이도 기술 업무. 설계와 문제 해결이 까다롭고 전문성이 필요하다."
EASY_ANCHOR = "단순하고 쉬운 반복 업무. 절차가 명확하고 빠르게 처리할 수 있다."
EMBEDDING_DIFFICULTY_WEIGHT = 0.3

_anchor_cache: dict[str, list[float]] = {}


async def _embed(text_value: str) -> list[float]:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.embeddings(model=EMBEDDING_MODEL, prompt=text_value)
    return response["embedding"]


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

    engine = get_engine()
    try:
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
    except Exception:
        logger.warning("임베딩 난이도 보정 계산 실패(document_chunks 조회) - 보정 없이 진행", exc_info=True)
        return {}
    finally:
        engine.dispose()

    return {
        row["source_id"]: (row["sim_hard"] - row["sim_easy"]) * EMBEDDING_DIFFICULTY_WEIGHT
        for row in rows
    }
