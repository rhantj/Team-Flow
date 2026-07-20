from __future__ import annotations

from app.main import AnalyzeRequest, analyze_meeting


def test_extracts_assignee_candidate_from_meeting_text_instead_of_rotating_attendees():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="유소은은 API 문서를 정리한다. 김민준이 발표자료를 작성한다.",
        participants=["김민준", "이서연", "박지수", "최동혁"],
    )

    result = analyze_meeting(request)

    candidates = [todo.assignee_candidate for todo in result.todos]
    assert "유소은" in candidates
    assert "김민준" in candidates


def test_leaves_assignee_candidate_empty_when_no_name_is_written_in_text():
    request = AnalyzeRequest(
        title="정기회의",
        meeting_date="2026-07-15",
        text="발표자료 초안 작성 논의를 진행했다.",
        participants=["김민준", "이서연"],
    )

    result = analyze_meeting(request)

    assert result.todos
    assert result.todos[0].assignee_candidate == ""
