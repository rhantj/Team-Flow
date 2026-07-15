from __future__ import annotations

from ml_workload_score.app.services import workload_db as db
from ml_workload_score.app.services.workload_model import (
    build_features,
    detect_overload_anomalies_auto,
    generate_synthetic_tasks,
)
from ml_workload_score.app.schema.workload_schema import (
    WorkloadMemberResult,
    WorkloadScoreData,
)


def get_workload_score(project_id: int, use_synthetic_fallback: bool = True) -> WorkloadScoreData:
    """
    프로젝트의 팀원별 업무 편중(과부하/저활동) 점수를 계산한다.

    - project_id: 대상 프로젝트
    - use_synthetic_fallback: 실제 DB 데이터가 없거나 연결 실패 시
      합성 데이터로 데모 응답을 줄지 여부 (개발/데모 단계 편의용, 운영 전환 시 False로)
    """
    try:
        tasks_df = db.load_tasks_from_db(project_id)
        source = "db"
    except Exception as e:
        if not use_synthetic_fallback:
            raise
        tasks_df = generate_synthetic_tasks(n_members=7)
        source = "synthetic_fallback"

    if tasks_df.empty:
        return WorkloadScoreData(
            project_id=project_id,
            source=source,
            method="N/A",
            members=[],
            note="배정된 업무가 없어 편중 점수를 계산할 수 없습니다.",
        )

    features = build_features(tasks_df)
    result = detect_overload_anomalies_auto(features)

    members = [
        WorkloadMemberResult(
            assignee_id=row["assignee_id"],
            task_count_total=int(row["task_count_total"]),
            completion_rate=round(float(row["completion_rate"]), 3),
            overload_score=round(float(row["overload_score_0_100"]), 1),
            is_anomaly=bool(row["is_anomaly"]),
            anomaly_type=row["anomaly_type"],
        )
        for _, row in result.iterrows()
    ]

    return WorkloadScoreData(
        project_id=project_id,
        source=source,
        method=result.attrs.get("method_used", "unknown"),
        members=members,
    )
