from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pandas as pd
import pytest

from ml_workload_score.app.services.workload_service import (
    _summarize_get_workload_score_outputs,
    get_workload_score,
)
from ml_workload_score.app.schema.workload_schema import (
    WorkloadMemberResult,
    WorkloadScoreData,
)


def _fake_tasks_df() -> pd.DataFrame:
    today = pd.Timestamp("2026-07-16")
    return pd.DataFrame([
        {"task_id": 1, "project_id": 1, "assignee_id": "1", "category": "백엔드",
         "priority": "높음", "status": "할 일", "due_date": today + pd.Timedelta(days=5)},
        {"task_id": 2, "project_id": 1, "assignee_id": "2", "category": "문서",
         "priority": "낮음", "status": "완료", "due_date": today - pd.Timedelta(days=1)},
    ])


@pytest.mark.asyncio
async def test_get_workload_score_passes_embedding_adjustments_to_build_features():
    fake_adjustments = {1: 0.42}
    with patch(
        "ml_workload_score.app.services.workload_service.db.load_tasks_from_db",
        return_value=_fake_tasks_df(),
    ), patch(
        "ml_workload_score.app.services.workload_service.compute_embedding_adjustments",
        AsyncMock(return_value=fake_adjustments),
    ), patch(
        "ml_workload_score.app.services.workload_service.build_features",
    ) as mock_build_features:
        mock_build_features.return_value = pd.DataFrame([
            {"assignee_id": "1", "task_count_total": 1, "completion_rate": 0.0,
             "overload_score_0_100": 10.0, "is_anomaly": False, "anomaly_type": "정상"},
        ])
        with patch(
            "ml_workload_score.app.services.workload_service.detect_overload_anomalies_auto",
        ) as mock_detect:
            mock_detect.return_value = mock_build_features.return_value
            mock_detect.return_value.attrs = {"method_used": "MAD"}
            await get_workload_score(project_id=1)

    _, kwargs = mock_build_features.call_args
    assert kwargs["embedding_adjustments"] == fake_adjustments


@pytest.mark.asyncio
async def test_get_workload_score_synthetic_fallback_still_works():
    """DB 조회 실패 시 synthetic fallback 경로는 임베딩 보정 없이도 그대로 동작해야 한다."""
    with patch(
        "ml_workload_score.app.services.workload_service.db.load_tasks_from_db",
        side_effect=RuntimeError("no db"),
    ), patch(
        "ml_workload_score.app.services.workload_service.compute_embedding_adjustments",
        AsyncMock(),
    ) as mock_adjustments:
        result = await get_workload_score(project_id=1, use_synthetic_fallback=True)

    assert result.source == "synthetic_fallback"
    assert len(result.members) > 0
    mock_adjustments.assert_not_called()


def test_get_workload_score_name_preserved_after_traceable():
    from ml_workload_score.app.services.workload_service import get_workload_score
    assert get_workload_score.__name__ == "get_workload_score"


# ============================================================
# process_outputs 요약 reducer 테스트
# (LangSmith 트레이스에 팀원별 개인 데이터 전체 대신 요약 통계만 기록되는지 검증)
# ============================================================
def test_summarize_get_workload_score_outputs_with_anomalies():
    data = WorkloadScoreData(
        project_id=7,
        source="db",
        method="MAD (소규모 팀)",
        members=[
            WorkloadMemberResult(
                assignee_id="1", task_count_total=5, completion_rate=0.4,
                overload_score=92.5, is_anomaly=True, anomaly_type="과부하 의심",
            ),
            WorkloadMemberResult(
                assignee_id="2", task_count_total=2, completion_rate=0.9,
                overload_score=10.0, is_anomaly=False, anomaly_type="정상",
            ),
        ],
        note=None,
    )
    result = _summarize_get_workload_score_outputs(data)
    assert result == {
        "project_id": 7,
        "source": "db",
        "method": "MAD (소규모 팀)",
        "member_count": 2,
        "anomaly_count": 1,
        "note": None,
    }


def test_summarize_get_workload_score_outputs_empty_members():
    data = WorkloadScoreData(
        project_id=3,
        source="db",
        method="N/A",
        members=[],
        note="배정된 업무가 없어 편중 점수를 계산할 수 없습니다.",
    )
    result = _summarize_get_workload_score_outputs(data)
    assert result == {
        "project_id": 3,
        "source": "db",
        "method": "N/A",
        "member_count": 0,
        "anomaly_count": 0,
        "note": "배정된 업무가 없어 편중 점수를 계산할 수 없습니다.",
    }
