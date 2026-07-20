from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from ai_contribution_report.app.services.contribution_service import (
    build_evidence,
    generate_contribution_reports,
)


def test_build_evidence_includes_task_and_meeting_stats():
    row = {
        "user_id": 1,
        "name": "김민준",
        "todo_done": 8,
        "todo_total": 10,
        "meetings_attended": 6,
        "meetings_total": 6,
    }

    evidence = build_evidence(row)

    assert evidence[0] == "To-Do 8/10건 완료"
    assert "회의 6/6회 참석 (참석률 100%)" in evidence


def test_build_evidence_handles_no_registered_meetings():
    row = {
        "user_id": 2,
        "name": "이서연",
        "todo_done": 0,
        "todo_total": 0,
        "meetings_attended": 0,
        "meetings_total": 0,
    }

    evidence = build_evidence(row)

    assert "등록된 회의 없음" in evidence


def test_build_evidence_includes_workload_score_when_available():
    row = {
        "user_id": 1,
        "name": "김민준",
        "todo_done": 8,
        "todo_total": 10,
        "meetings_attended": 6,
        "meetings_total": 6,
    }

    evidence = build_evidence(row, {"overload_score": 82.5, "anomaly_type": "과부하 의심"})

    assert "업무 편중 점수 82.5점 (과부하 의심)" in evidence


@pytest.mark.asyncio
async def test_generate_contribution_reports_returns_empty_list_when_no_members():
    with patch(
        "ai_contribution_report.app.services.contribution_service.db.load_contribution_inputs",
        return_value=[],
    ), patch("ai_contribution_report.app.services.contribution_service.db.load_workload_scores") as mock_workload:
        result = await generate_contribution_reports(project_id=1)

    assert result == []
    mock_workload.assert_not_called()


@pytest.mark.asyncio
async def test_generate_contribution_reports_builds_summary_and_saves():
    fake_rows = [
        {
            "user_id": 1,
            "name": "김민준",
            "todo_done": 8,
            "todo_total": 10,
            "meetings_attended": 6,
            "meetings_total": 6,
        },
    ]
    with patch(
        "ai_contribution_report.app.services.contribution_service.db.load_contribution_inputs",
        return_value=fake_rows,
    ), patch(
        "ai_contribution_report.app.services.contribution_service.db.load_workload_scores",
        return_value={1: {"overload_score": 82.5, "anomaly_type": "과부하 의심"}},
    ), patch(
        "ai_contribution_report.app.services.contribution_service.generate_summary",
        AsyncMock(return_value="김민준님은 업무 완료율이 높고 회의에 성실히 참여했습니다."),
    ), patch(
        "ai_contribution_report.app.services.contribution_service.db.save_contribution_reports",
    ) as mock_save:
        result = await generate_contribution_reports(project_id=1)

    assert len(result) == 1
    assert result[0].user_id == 1
    assert result[0].name == "김민준"
    assert result[0].summary == "김민준님은 업무 완료율이 높고 회의에 성실히 참여했습니다."
    assert result[0].evidence[0] == "To-Do 8/10건 완료"
    assert "업무 편중 점수 82.5점 (과부하 의심)" in result[0].evidence
    mock_save.assert_called_once()
