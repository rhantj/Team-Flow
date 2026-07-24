from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.graph.task_resolver import resolve_task_ref


def _row(source_id: int, content: str, similarity: float, source_type: str = "task") -> dict:
    return {
        "source_type": source_type,
        "source_id": source_id,
        "content": content,
        "similarity": similarity,
    }


@pytest.mark.asyncio
async def test_returns_single_confident_match() -> None:
    rows = [_row(37, "로그인 API 구현 - WF-250", 0.62), _row(85, "대시보드 차트", 0.21)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text", new=AsyncMock(return_value=[0.1])
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(return_value=rows),
    ):
        match = await resolve_task_ref(object(), 1, "로그인 업무")

    assert match.task_id == 37
    assert match.title.startswith("로그인 API 구현")


@pytest.mark.asyncio
async def test_returns_candidates_when_scores_are_close() -> None:
    """비슷한 후보가 여럿이면 임의로 고르지 않고 사용자에게 묻는다."""
    rows = [_row(37, "로그인 API 구현", 0.55), _row(38, "로그인 화면 개선", 0.54)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text", new=AsyncMock(return_value=[0.1])
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(return_value=rows),
    ):
        match = await resolve_task_ref(object(), 1, "로그인")

    assert match.task_id is None
    assert [c.task_id for c in match.candidates] == [37, 38]


@pytest.mark.asyncio
async def test_ignores_non_task_sources() -> None:
    """회의록·액션아이템의 source_id는 task id가 아니다. 섞이면 엉뚱한 업무를 건드린다."""
    rows = [_row(9, "회의 요약", 0.90, source_type="meeting"), _row(37, "로그인 API 구현", 0.40)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text", new=AsyncMock(return_value=[0.1])
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(return_value=rows),
    ):
        match = await resolve_task_ref(object(), 1, "로그인 업무")

    assert match.task_id == 37


@pytest.mark.asyncio
async def test_returns_nothing_when_no_task_found() -> None:
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text", new=AsyncMock(return_value=[0.1])
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(return_value=[]),
    ):
        match = await resolve_task_ref(object(), 1, "없는 업무")

    assert match.task_id is None
    assert match.candidates == []


@pytest.mark.asyncio
async def test_returns_nothing_when_search_fails() -> None:
    """검색 실패가 500이 되면 안 된다."""
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text",
        new=AsyncMock(side_effect=RuntimeError("임베딩 실패")),
    ):
        match = await resolve_task_ref(object(), 1, "로그인 업무")

    assert match.task_id is None
    assert match.candidates == []


@pytest.mark.asyncio
async def test_rejects_single_low_similarity_result() -> None:
    """단일 결과라도 관련성이 바닥이면 확정하지 않는다(엉뚱한 업무 조작 방지)."""
    rows = [_row(37, "전혀 다른 업무", 0.12)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.embed_text", new=AsyncMock(return_value=[0.1])
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(return_value=rows),
    ):
        match = await resolve_task_ref(object(), 1, "로그인 업무")

    assert match.task_id is None
    assert match.candidates == []
