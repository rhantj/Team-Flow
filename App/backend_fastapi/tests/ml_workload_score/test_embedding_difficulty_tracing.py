from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, patch

import pytest

from ml_workload_score.app.services import embedding_difficulty as mod


@pytest.mark.asyncio
async def test_embed_still_async_and_returns_embedding_after_traceable():
    assert inspect.iscoroutinefunction(mod._embed)

    fake_client = AsyncMock()
    fake_client.embeddings = AsyncMock(return_value={"embedding": [0.1, 0.2, 0.3]})

    with patch(
        "ml_workload_score.app.services.embedding_difficulty.ollama.AsyncClient",
        return_value=fake_client,
    ):
        result = await mod._embed("테스트 문장")

    assert result == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_get_anchor_embeddings_still_async_and_caches():
    mod._anchor_cache.clear()
    assert inspect.iscoroutinefunction(mod.get_anchor_embeddings)

    fake_client = AsyncMock()
    fake_client.embeddings = AsyncMock(return_value={"embedding": [1.0]})

    with patch(
        "ml_workload_score.app.services.embedding_difficulty.ollama.AsyncClient",
        return_value=fake_client,
    ):
        hard, easy = await mod.get_anchor_embeddings()

    assert hard == [1.0]
    assert easy == [1.0]


# ============================================================
# process_inputs / process_outputs 요약 reducer 테스트
# (LangSmith 트레이스에 전체 임베딩 벡터/업무별 보정치 대신 요약만 기록되는지 검증)
# ============================================================
def test_summarize_embed_outputs():
    result = mod._summarize_embed_outputs([0.1, 0.2, 0.3])
    assert result == {"embedding_dim": 3}


def test_summarize_get_anchor_embeddings_outputs():
    hard_vec = [0.1] * 768
    easy_vec = [0.2] * 768
    result = mod._summarize_get_anchor_embeddings_outputs((hard_vec, easy_vec))
    assert result == {"hard_dim": 768, "easy_dim": 768}


def test_summarize_compute_embedding_adjustments_inputs():
    result = mod._summarize_compute_embedding_adjustments_inputs({
        "task_ids": [1, 2, 3, 4],
        "project_id": 9,
    })
    assert result == {"task_ids_count": 4, "project_id": 9}


def test_summarize_compute_embedding_adjustments_outputs_with_values():
    result = mod._summarize_compute_embedding_adjustments_outputs({1: 0.5, 2: -0.2, 3: 0.1})
    assert result == {
        "adjustments_count": 3,
        "adjustments_min": -0.2,
        "adjustments_max": 0.5,
    }


def test_summarize_compute_embedding_adjustments_outputs_empty():
    result = mod._summarize_compute_embedding_adjustments_outputs({})
    assert result == {
        "adjustments_count": 0,
        "adjustments_min": None,
        "adjustments_max": None,
    }
