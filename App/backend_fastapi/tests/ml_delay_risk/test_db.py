from __future__ import annotations

from ml_delay_risk.db import TASK_ACTIVITY_TYPES, _TASK_ACTIVITIES_QUERY


def test_task_activity_query_filters_polymorphic_targets_by_type() -> None:
    query = str(_TASK_ACTIVITIES_QUERY)
    expected_types = {
        "TASK_CREATED",
        "STATUS_CHANGED",
        "ASSIGNEE_CHANGED",
        "TASK_UPDATED",
        "TASK_DELETED",
        "CHECKLIST_CREATED",
        "CHECKLIST_COMPLETED",
    }

    assert set(TASK_ACTIVITY_TYPES) == expected_types
    assert "a.type IN" in query
    assert all(f"'{activity_type}'" in query for activity_type in expected_types)
    # type 필터와 프로젝트 소속 task 확인이 모두 있어야 동일 target_id를 가진 다른 엔티티와
    # 다른 프로젝트의 활동을 동시에 배제할 수 있다.
    assert "t.id = a.target_id" in query
    assert "t.project_id = a.project_id" in query
