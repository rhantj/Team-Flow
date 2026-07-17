from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ml_workload_score.app.services import embedding_difficulty as ed


@pytest.fixture(autouse=True)
def reset_anchor_cache():
    ed._anchor_cache.clear()
    yield
    ed._anchor_cache.clear()


@pytest.mark.asyncio
async def test_get_anchor_embeddings_caches_after_first_call():
    fake_embed = AsyncMock(side_effect=[[0.1, 0.2], [0.9, 0.8]])
    with patch.object(ed, "_embed", fake_embed):
        hard1, easy1 = await ed.get_anchor_embeddings()
        call_count_after_first = fake_embed.await_count
        hard2, easy2 = await ed.get_anchor_embeddings()

    assert hard1 == [0.1, 0.2]
    assert easy1 == [0.9, 0.8]
    assert (hard2, easy2) == (hard1, easy1)
    assert fake_embed.await_count == call_count_after_first  # 두 번째 호출은 캐시만 사용, embed 재호출 없음


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_happy_path():
    fake_rows = [
        {"source_id": 1, "sim_hard": 0.8, "sim_easy": 0.2},
        {"source_id": 2, "sim_hard": 0.3, "sim_easy": 0.7},
    ]
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value.mappings.return_value.all.return_value = fake_rows
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine", return_value=mock_engine):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result[1] == pytest.approx((0.8 - 0.2) * ed.EMBEDDING_DIFFICULTY_WEIGHT)
    assert result[2] == pytest.approx((0.3 - 0.7) * ed.EMBEDDING_DIFFICULTY_WEIGHT)
    mock_engine.dispose.assert_called_once()


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_returns_empty_dict_on_failure():
    with patch.object(ed, "get_anchor_embeddings", AsyncMock(side_effect=RuntimeError("ollama down"))):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result == {}


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_empty_task_ids_skips_query():
    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine") as mock_get_engine:
        result = await ed.compute_embedding_adjustments(task_ids=[], project_id=1)

    assert result == {}
    mock_get_engine.assert_not_called()


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_returns_empty_dict_when_get_engine_fails():
    # get_engine()이 DATABASE_URL 미설정 등으로 RuntimeError를 던지는 경우 -
    # get_engine() 호출이 try 밖에 있으면 이 예외가 그대로 전파되어 계약을 어긴다.
    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine", side_effect=RuntimeError("DATABASE_URL not set")):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result == {}


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_returns_empty_dict_on_query_execution_failure():
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.side_effect = RuntimeError("document_chunks query failed")
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine", return_value=mock_engine):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result == {}
    mock_engine.dispose.assert_called_once()  # 쿼리 실패해도 엔진은 해제되어야 한다
