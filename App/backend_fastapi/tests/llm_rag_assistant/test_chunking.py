from __future__ import annotations

from llm_rag_assistant.app.services.chunking import chunk_text


def test_chunk_text_returns_empty_list_for_blank_content() -> None:
    assert chunk_text("") == []
    assert chunk_text("   \n  ") == []


def test_chunk_text_returns_single_chunk_when_short() -> None:
    result = chunk_text("짧은 회의록 내용입니다.", chunk_size=500, overlap=50)
    assert result == ["짧은 회의록 내용입니다."]


def test_chunk_text_splits_long_content_with_overlap() -> None:
    content = "가" * 1200
    result = chunk_text(content, chunk_size=500, overlap=50)
    assert len(result) == 3
    assert all(len(chunk) <= 500 for chunk in result)
    # overlap 검증: 두 번째 청크의 시작이 첫 번째 청크의 끝과 50자 겹침
    assert result[0][-50:] == result[1][:50]
