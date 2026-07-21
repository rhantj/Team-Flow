from __future__ import annotations

import pandas as pd

from ml_workload_score.app.services.workload_model import (
    _summarize_build_features_inputs,
    _summarize_build_features_outputs,
    _summarize_detect_overload_inputs,
    _summarize_detect_overload_outputs,
    build_features,
    detect_overload_anomalies_auto,
)


def test_build_features_name_preserved_after_traceable():
    assert build_features.__name__ == "build_features"


def test_detect_overload_anomalies_auto_name_preserved_after_traceable():
    assert detect_overload_anomalies_auto.__name__ == "detect_overload_anomalies_auto"


# ============================================================
# process_inputs / process_outputs 요약 reducer 테스트
# (LangSmith 트레이스에 전체 DataFrame 대신 요약 통계만 기록되는지 검증)
# ============================================================
def _sample_tasks_df_for_summary() -> pd.DataFrame:
    return pd.DataFrame([
        {"task_id": 1, "assignee_id": "a", "category": "백엔드", "priority": "높음"},
        {"task_id": 2, "assignee_id": "a", "category": "문서", "priority": "낮음"},
        {"task_id": 3, "assignee_id": "b", "category": "기획", "priority": "중간"},
    ])


def test_summarize_build_features_inputs_with_adjustments():
    df = _sample_tasks_df_for_summary()
    result = _summarize_build_features_inputs({
        "tasks_df": df,
        "today": None,
        "embedding_adjustments": {1: 1.0, 2: -0.5},
    })
    assert result == {
        "tasks_df_rows": 3,
        "tasks_df_columns": ["task_id", "assignee_id", "category", "priority"],
        "embedding_adjustments_count": 2,
    }


def test_summarize_build_features_inputs_without_adjustments():
    df = _sample_tasks_df_for_summary()
    result = _summarize_build_features_inputs({
        "tasks_df": df,
        "today": None,
        "embedding_adjustments": None,
    })
    assert result["embedding_adjustments_count"] == 0


def test_summarize_build_features_outputs():
    feature_df = pd.DataFrame([
        {"assignee_id": "a", "task_count_active": 3, "completion_rate": 0.5},
        {"assignee_id": "b", "task_count_active": 1, "completion_rate": 0.9},
    ])
    result = _summarize_build_features_outputs(feature_df)
    assert result == {
        "feature_df_rows": 2,
        "feature_df_columns": ["assignee_id", "task_count_active", "completion_rate"],
    }


def test_summarize_detect_overload_inputs():
    feature_df = pd.DataFrame([
        {"assignee_id": "a"},
        {"assignee_id": "b"},
        {"assignee_id": "c"},
    ])
    result = _summarize_detect_overload_inputs({
        "feature_df": feature_df,
        "small_team_threshold": 15,
    })
    assert result == {"feature_df_rows": 3, "small_team_threshold": 15}


def test_summarize_detect_overload_outputs_with_anomalies():
    result_df = pd.DataFrame([
        {"assignee_id": "a", "is_anomaly": True, "overload_score_0_100": 92.5},
        {"assignee_id": "b", "is_anomaly": False, "overload_score_0_100": 10.0},
        {"assignee_id": "c", "is_anomaly": True, "overload_score_0_100": 60.0},
    ])
    result_df.attrs["method_used"] = "MAD (소규모 팀)"

    result = _summarize_detect_overload_outputs(result_df)
    assert result == {
        "result_rows": 3,
        "anomaly_count": 2,
        "top_score": 92.5,
        "method_used": "MAD (소규모 팀)",
    }


def test_summarize_detect_overload_outputs_empty_df():
    empty_df = pd.DataFrame(columns=["assignee_id", "is_anomaly", "overload_score_0_100"])
    empty_df.attrs["method_used"] = "MAD (소규모 팀)"

    result = _summarize_detect_overload_outputs(empty_df)
    assert result == {
        "result_rows": 0,
        "anomaly_count": 0,
        "top_score": None,
        "method_used": "MAD (소규모 팀)",
    }
