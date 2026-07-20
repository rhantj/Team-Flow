from __future__ import annotations

from unittest.mock import MagicMock, patch

from contribution_score.app.services import contribution_db as cdb


def test_load_meeting_attendance_happy_path():
    fake_attendance_rows = [
        {"assignee_id": 1, "attended_count": 3},
        {"assignee_id": 2, "attended_count": 5},
    ]
    mock_execute_result = MagicMock()
    mock_execute_result.mappings.return_value.all.return_value = fake_attendance_rows
    mock_execute_result.scalar_one.return_value = 5
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value = mock_execute_result
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(cdb, "get_engine", return_value=mock_engine):
        attendance, total = cdb.load_meeting_attendance(project_id=1)

    assert attendance == {"1": 3, "2": 5}
    assert total == 5
    mock_engine.dispose.assert_called_once()


def test_load_meeting_attendance_no_meetings():
    mock_execute_result = MagicMock()
    mock_execute_result.mappings.return_value.all.return_value = []
    mock_execute_result.scalar_one.return_value = 0
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value = mock_execute_result
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(cdb, "get_engine", return_value=mock_engine):
        attendance, total = cdb.load_meeting_attendance(project_id=1)

    assert attendance == {}
    assert total == 0
