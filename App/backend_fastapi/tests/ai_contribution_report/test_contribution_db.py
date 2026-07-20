from __future__ import annotations

from unittest.mock import MagicMock, patch

from sqlalchemy.exc import ProgrammingError

from ai_contribution_report.app.services.contribution_db import load_workload_scores, merge_contribution_rows


def test_merge_contribution_rows_combines_task_and_meeting_stats():
    task_rows = [
        {"user_id": 1, "name": "김민준", "todo_total": 10, "todo_done": 8},
        {"user_id": 2, "name": "이서연", "todo_total": 3, "todo_done": 3},
    ]
    meeting_rows = [
        {"user_id": 1, "meetings_total": 6, "meetings_attended": 6},
        {"user_id": 2, "meetings_total": 6, "meetings_attended": 5},
    ]

    result = merge_contribution_rows(task_rows, meeting_rows)

    assert result == [
        {
            "user_id": 1,
            "name": "김민준",
            "todo_done": 8,
            "todo_total": 10,
            "meetings_attended": 6,
            "meetings_total": 6,
        },
        {
            "user_id": 2,
            "name": "이서연",
            "todo_done": 3,
            "todo_total": 3,
            "meetings_attended": 5,
            "meetings_total": 6,
        },
    ]


def test_merge_contribution_rows_defaults_meeting_stats_to_zero_when_missing():
    task_rows = [{"user_id": 3, "name": "박지수", "todo_total": 2, "todo_done": 1}]
    meeting_rows: list[dict] = []

    result = merge_contribution_rows(task_rows, meeting_rows)

    assert result == [
        {
            "user_id": 3,
            "name": "박지수",
            "todo_done": 1,
            "todo_total": 2,
            "meetings_attended": 0,
            "meetings_total": 0,
        },
    ]


def test_load_workload_scores_returns_empty_when_optional_table_is_missing():
    engine = MagicMock()
    connection = MagicMock()
    connection.execute.side_effect = ProgrammingError("SELECT * FROM workload_scores", {}, Exception("missing"))
    engine.connect.return_value.__enter__.return_value = connection

    with patch("ai_contribution_report.app.services.contribution_db.get_engine", return_value=engine):
        result = load_workload_scores(project_id=1)

    assert result == {}
    engine.dispose.assert_called_once()
