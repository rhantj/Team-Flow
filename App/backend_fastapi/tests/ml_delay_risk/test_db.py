from __future__ import annotations

import sqlalchemy as sa

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
    # 값을 SQL 텍스트에 직접 나열하지 않고 바인드 파라미터로만 참조해야
    # TASK_ACTIVITY_TYPES가 유일한 출처로 남는다 (SQL과의 이중 하드코딩 방지).
    # expanding bindparam은 컴파일 전 str()에서 __[POSTCOMPILE_...] 플레이스홀더로 보인다 -
    # 값 목록이 실행 시점에 IN (...)으로 확장되고 텍스트에 하드코딩돼 있지 않다는 뜻이다.
    assert "a.type IN (__[POSTCOMPILE_task_activity_types])" in query
    assert not any(f"'{activity_type}'" in query for activity_type in expected_types)
    # type 필터와 프로젝트 소속 task 확인이 모두 있어야 동일 target_id를 가진 다른 엔티티와
    # 다른 프로젝트의 활동을 동시에 배제할 수 있다.
    assert "t.id = a.target_id" in query
    assert "t.project_id = a.project_id" in query


def test_task_activity_query_expands_bindparam_and_filters_rows() -> None:
    """TASK_ACTIVITY_TYPES가 실제 실행 시 IN (...) 목록으로 정상 확장되는지,
    허용되지 않은 type/다른 프로젝트 소속 target_id가 함께 걸러지는지 SQLite로 검증한다
    (public 스키마 접두사는 postgres 전용이라 여기서는 스키마 없는 등가 쿼리를 쓴다)."""
    engine = sa.create_engine("sqlite:///:memory:")
    equivalent_query = sa.text(
        """
        SELECT a.target_id AS task_id, a.created_at
        FROM activities a
        WHERE a.project_id = :project_id
          AND a.type IN :task_activity_types
          AND EXISTS (
              SELECT 1 FROM tasks t
              WHERE t.id = a.target_id AND t.project_id = a.project_id
          )
        """
    ).bindparams(sa.bindparam("task_activity_types", expanding=True))

    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE tasks (id INTEGER PRIMARY KEY, project_id INTEGER)"))
        conn.execute(
            sa.text(
                "CREATE TABLE activities ("
                "id INTEGER PRIMARY KEY, project_id INTEGER, target_id INTEGER, "
                "type TEXT, created_at TEXT)"
            )
        )
        conn.execute(sa.text("INSERT INTO tasks (id, project_id) VALUES (1, 100)"))
        conn.execute(
            sa.text(
                "INSERT INTO activities (project_id, target_id, type, created_at) "
                "VALUES (100, 1, 'TASK_CREATED', '2026-01-01')"
            )
        )
        # 허용 목록에 없는 type -> 배제되어야 함.
        conn.execute(
            sa.text(
                "INSERT INTO activities (project_id, target_id, type, created_at) "
                "VALUES (100, 1, 'MEETING_NOTE_ADDED', '2026-01-01')"
            )
        )
        # 다른 프로젝트 소속 tasks.id와 우연히 target_id가 같은 활동 -> 배제되어야 함.
        conn.execute(
            sa.text(
                "INSERT INTO activities (project_id, target_id, type, created_at) "
                "VALUES (100, 999, 'TASK_CREATED', '2026-01-01')"
            )
        )

    with engine.connect() as conn:
        rows = conn.execute(
            equivalent_query, {"project_id": 100, "task_activity_types": TASK_ACTIVITY_TYPES}
        ).fetchall()

    assert len(rows) == 1
    assert rows[0].task_id == 1
