from __future__ import annotations

import pandas as pd
import pytest

from ml_workload_score.app.services.workload_model import (
    build_features,
    detect_overload_anomalies_auto,
    detect_overload_anomalies_robust,
)


def _tasks_df_for_team_mean() -> pd.DataFrame:
    """팀원 3명, 완료율이 서로 다른 소규모 팀(MAD 경로를 타도록 5명 미만)."""
    today = pd.Timestamp("2026-07-16")
    rows = []
    # 팀원 a: 4개 중 1개 완료 (completion_rate=0.25, 과부하 후보 — active 많음)
    rows.append({"task_id": 1, "project_id": 1, "assignee_id": "a", "category": "백엔드",
                 "priority": "높음", "status": "완료", "due_date": today - pd.Timedelta(days=1)})
    for i in range(2, 5):
        rows.append({"task_id": i, "project_id": 1, "assignee_id": "a", "category": "백엔드",
                     "priority": "높음", "status": "할 일", "due_date": today + pd.Timedelta(days=5)})
    # 팀원 b: 2개 중 2개 완료 (completion_rate=1.0)
    for i in range(5, 7):
        rows.append({"task_id": i, "project_id": 1, "assignee_id": "b", "category": "문서",
                     "priority": "낮음", "status": "완료", "due_date": today - pd.Timedelta(days=1)})
    # 팀원 c: 2개 중 0개 완료 (completion_rate=0.0)
    for i in range(7, 9):
        rows.append({"task_id": i, "project_id": 1, "assignee_id": "c", "category": "문서",
                     "priority": "낮음", "status": "할 일", "due_date": today + pd.Timedelta(days=5)})
    return pd.DataFrame(rows)


def _expected_team_mean(features: pd.DataFrame) -> float:
    return float(features["completion_rate"].mean())


def test_detect_overload_anomalies_robust_attaches_team_mean_completion_attr():
    """MAD 경로(소규모 팀)가 anomaly_type 판정에 실제로 쓴 팀 평균 완료율을
    result.attrs['team_mean_completion']으로 노출해야 한다 — 프론트 편중도 근거
    패널이 이 값 없이 '팀 평균보다 높음/낮음'을 단정하면 심사 근거를 오도할 수 있다."""
    features = build_features(_tasks_df_for_team_mean())
    result = detect_overload_anomalies_robust(features)

    assert "team_mean_completion" in result.attrs
    assert result.attrs["team_mean_completion"] == pytest.approx(_expected_team_mean(features))


def test_detect_overload_anomalies_auto_preserves_team_mean_completion_attr():
    """자동 라우팅(detect_overload_anomalies_auto)도 method_used와 마찬가지로
    team_mean_completion attrs를 잃지 않고 그대로 전달해야 한다."""
    features = build_features(_tasks_df_for_team_mean())
    result = detect_overload_anomalies_auto(features)

    assert result.attrs.get("method_used") is not None
    assert "team_mean_completion" in result.attrs
    assert result.attrs["team_mean_completion"] == pytest.approx(_expected_team_mean(features))
