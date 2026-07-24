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
async def test_explicit_code_resolves_by_exact_match_not_embedding() -> None:
    """WF-195 같은 명시적 코드는 임베딩이 아니라 본문 정확 일치로 해소한다."""
    code_rows = [_row(50, "FS-3 대시보드/지연 위험도 - [Jira01 재검증 테스트 삽입] WF-195", 0.0)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.find_task_chunks_by_code",
        new=AsyncMock(return_value=code_rows),
    ) as by_code, patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(),
    ) as by_embedding:
        match = await resolve_task_ref(object(), 1, "WF-195 완료로 바꿔줘")

    assert match.task_id == 50
    by_code.assert_awaited_once()
    by_embedding.assert_not_called()  # 코드가 있으면 임베딩 경로로 새지 않는다.


@pytest.mark.asyncio
async def test_explicit_code_with_multiple_matches_asks_user() -> None:
    """같은 코드 토큰이 여러 업무에 걸리면 임의로 고르지 않고 되묻는다."""
    code_rows = [_row(48, "FS-1 ... WF-193", 0.0), _row(53, "FS-6 ... WF-193", 0.0)]
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.find_task_chunks_by_code",
        new=AsyncMock(return_value=code_rows),
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(),
    ):
        match = await resolve_task_ref(object(), 1, "WF-193 완료로")

    assert match.task_id is None
    assert [c.task_id for c in match.candidates] == [48, 53]


@pytest.mark.asyncio
async def test_missing_code_does_not_fall_back_to_embedding() -> None:
    """존재하지 않는 코드를 유사한 다른 업무로 억지 매칭하지 않는다(못 찾음으로 처리)."""
    with patch(
        "llm_rag_assistant.app.graph.task_resolver.find_task_chunks_by_code",
        new=AsyncMock(return_value=[]),
    ), patch(
        "llm_rag_assistant.app.graph.task_resolver.search_similar_chunks",
        new=AsyncMock(),
    ) as by_embedding:
        match = await resolve_task_ref(object(), 1, "WF-9999 완료로")

    assert match.task_id is None
    assert match.candidates == []
    by_embedding.assert_not_called()


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
