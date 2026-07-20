from __future__ import annotations

import asyncio
import logging

from ml_workload_score.app.services import workload_db as db
from ml_workload_score.app.services.embedding_difficulty import compute_embedding_adjustments
from ml_workload_score.app.services.workload_model import (
    build_features,
    detect_overload_anomalies_auto,
    generate_synthetic_tasks,
)
from ml_workload_score.app.schema.workload_schema import (
    WorkloadMemberResult,
    WorkloadScoreData,
)

logger = logging.getLogger(__name__)


async def get_workload_score(project_id: int, use_synthetic_fallback: bool = False) -> WorkloadScoreData:
    """
    프로젝트의 팀원별 업무 편중(과부하/저활동) 점수를 계산한다.

    - project_id: 대상 프로젝트
    - use_synthetic_fallback: 실제 DB 데이터가 없거나 연결 실패 시
      합성 데이터로 데모 응답을 줄지 여부. 기본값 False (운영 기본 동작:
      실패 시 에러를 그대로 올림). 데모/개발 환경에서만 명시적으로 True로 호출할 것.
    """
    embedding_adjustments: dict[int, float] = {}
    try:
        tasks_df = await asyncio.to_thread(db.load_tasks_from_db, project_id)
        source = "db"
        if not tasks_df.empty:
            embedding_adjustments = await compute_embedding_adjustments(
                tasks_df["task_id"].tolist(), project_id
            )
    except Exception:
        if not use_synthetic_fallback:
            raise
        logger.warning(
            "project_id=%s: DB 조회 실패, synthetic fallback 데이터로 대체", project_id
        )
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

    features = build_features(tasks_df, embedding_adjustments=embedding_adjustments)
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
