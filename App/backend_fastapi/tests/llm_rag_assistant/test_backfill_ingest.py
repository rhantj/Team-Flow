from __future__ import annotations

from llm_rag_assistant.scripts.backfill_ingest import _build_meeting_content


def test_build_meeting_content_joins_decisions_list_by_item_not_by_character() -> None:
    content = _build_meeting_content(
        summary="회의 요약입니다.",
        decisions=["우선 문서 업로드 기능을 개발한다", "리뷰는 팀장이 진행한다"],
        risks=["일정이 촉박하다"],
    )

    assert "결정사항: 우선 문서 업로드 기능을 개발한다, 리뷰는 팀장이 진행한다" in content
    assert "위험요소: 일정이 촉박하다" in content
    # 문자 단위로 쪼개졌다면 각 결정사항의 첫 글자만 있는 콤마투성이 문자열이 되어버린다.
    assert '"' not in content
    assert "[" not in content


def test_build_meeting_content_handles_missing_decisions_and_risks() -> None:
    content = _build_meeting_content(summary="요약만 있음", decisions=None, risks=None)

    assert content == "요약만 있음"
