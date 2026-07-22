from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from ml_workload_score.app.schema.workload_schema import WorkloadMemberResult, WorkloadScoreData

client = TestClient(app)


def _fake_workload_data() -> WorkloadScoreData:
    return WorkloadScoreData(
        project_id=1,
        source="db",
        method="MAD (소규모 팀)",
        members=[
            WorkloadMemberResult(
                assignee_id="3", task_count_total=10, completion_rate=0.8,
                overload_score=10.0, is_anomaly=False, anomaly_type="정상",
                task_count_active_rel=1.0, difficulty_avg_rel=1.0, overdue_count=0,
            )
        ],
    )


def test_score_contribution_returns_success_when_service_succeeds() -> None:
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(return_value=_fake_workload_data()),
    ), patch(
        "contribution_score.app.routers.contribution_router.load_meeting_attendance",
        return_value=({"3": 4}, 5),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    member = body["data"]["members"][0]
    assert member["assignee_id"] == "3"
    assert member["task_component"] == 80.0
    assert member["meeting_component"] == 80.0
    assert member["workload_component"] == 100.0


def test_score_contribution_returns_500_with_error_envelope_when_workload_fails() -> None:
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(side_effect=RuntimeError("db unreachable")),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 500
    assert response.json()["detail"]["error"]["code"] == "CONTRIBUTION_SCORE_FAILED"


def test_score_contribution_empty_members_returns_note() -> None:
    empty_workload = WorkloadScoreData(
        project_id=1, source="db", method="N/A", members=[], note="배정된 업무가 없습니다.",
    )
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(return_value=empty_workload),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["members"] == []
    assert body["data"]["note"] is not None
