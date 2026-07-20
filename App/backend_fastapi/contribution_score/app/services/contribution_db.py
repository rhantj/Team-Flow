from __future__ import annotations

from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine

_ATTENDANCE_QUERY = text("""
    SELECT ma.user_id AS assignee_id, COUNT(*) AS attended_count
    FROM meeting_attendees ma
    JOIN meetings m ON m.id = ma.meeting_id
    WHERE m.project_id = :project_id
    GROUP BY ma.user_id
""")

_TOTAL_MEETINGS_QUERY = text("""
    SELECT COUNT(*) AS total FROM meetings WHERE project_id = :project_id
""")


def load_meeting_attendance(project_id: int) -> tuple[dict[str, int], int]:
    """
    특정 프로젝트의 (팀원별 회의 참석 횟수, 전체 회의 수)를 반환한다.
    meeting_attendees는 "회의 참석자 태깅(기여도 근거로도 사용)" 목적으로 이미 설계된 테이블.
    """
    engine = get_engine()
    try:
        with engine.connect() as conn:
            attendance_rows = conn.execute(
                _ATTENDANCE_QUERY, {"project_id": project_id}
            ).mappings().all()
            total_meetings = conn.execute(
                _TOTAL_MEETINGS_QUERY, {"project_id": project_id}
            ).scalar_one()
    finally:
        engine.dispose()

    attendance = {str(row["assignee_id"]): int(row["attended_count"]) for row in attendance_rows}
    return attendance, int(total_meetings)
