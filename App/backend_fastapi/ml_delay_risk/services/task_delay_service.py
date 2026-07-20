"""Supabase(tasks/milestones/task_checklists) 업무에 대한 지연 위험도 추론 + ml_predictions 적재.

delay_model.py는 Jira 이슈 데이터셋으로 학습됐고(feature_engineering.py 참고), 이 서비스가
운영 중인 실제 스키마(팀 업무 트래커: milestones/tasks/task_checklists)에서 읽은 값을 그
피처 계약(~35개 키)에 맞춰 "최선 근사(best-effort)"로 채워 넣는다.

# 매핑 근거 (approximation notes)

실제로 대응 가능한 신호(학습 피처보다 오히려 더 정확한 경우도 있음):
    status(할일/진행중/블로커/완료)  -> status_at_cutoff
    priority                        -> priority_name
    category (18종)                 -> issuetype_name 대용
    tasks.due_date / milestones.due_date -> proxy_deadline_hours
        (Jira 데이터셋엔 마감일이 없어 동일 유형의 과거 처리시간 중앙값으로 추정했지만,
         이 스키마엔 진짜 마감일이 있으므로 그 값을 그대로 쓴다 - 학습 때보다 더 정확한 입력.)
    task_checklists 완료 비율        -> progress_ratio_at_cutoff (원래는 "누적 투입시간 ÷ 예상시간")
    updated_at ~ now                -> hours_in_current_status (상태 변경 이력이 없어 마지막
                                        수정 시각으로 근사; status가 그대로여도 다른 필드 수정
                                        시 갱신되므로 다소 과소평가될 수 있음)

이 스키마에 대응 개념이 아예 없는 Jira 전용 피처(issuelinks, worklog, 서브태스크 상태,
이슈 코멘트, 상태변경/재배정 이력, reopen 횟수 등)는 모델이 학습 때 본 분포에 맞춰
안전한 기본값(0 / False / "Unknown" / "unassigned")으로 채운다 - feature_engineering.py가
Jira 필드 결측 시 쓰는 것과 동일한 방어적 기본값 패턴이다.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import pandas as pd

from ml_delay_risk.db import get_engine, insert_predictions, load_tasks_for_project
from ml_delay_risk.models import delay_model
from ml_delay_risk.models.feature_engineering import RISK_CLASS_API_LABELS, is_blocked_status

STATUS_TO_JIRA_LIKE = {
    "done": "Done",
    "blocked": "Blocked",
    "inprogress": "In Progress",
    "todo": "Open",
}

RESULT_KOREAN_LABELS = {
    "NORMAL": "정상",
    "CAUTION": "주의",
    "DANGER": "위험",
}


def _hours_between(start: Optional[pd.Timestamp], end: pd.Timestamp) -> float:
    if start is None or pd.isna(start):
        return 0.0
    return max((end - start).total_seconds() / 3600, 0.0)


def _milestone_completion_map(tasks_df: pd.DataFrame) -> dict[int, float]:
    """마일스톤별 완료율 - parent_unresolved(상위 마일스톤 미해결 여부) 근사에 사용."""
    completion: dict[int, float] = {}
    for milestone_id, group in tasks_df.groupby("milestone_id"):
        if pd.isna(milestone_id):
            continue
        total = len(group)
        done = int((group["status"] == "done").sum())
        completion[int(milestone_id)] = done / total if total > 0 else 0.0
    return completion


def build_feature_row(
    task_row: pd.Series,
    *,
    now: datetime,
    milestone_completion: dict[int, float],
) -> dict[str, Any]:
    """tasks/milestones/task_checklists 조인 결과 한 행을 delay_model 피처 딕셔너리로 변환."""
    title = task_row.get("title") or ""
    category = task_row.get("category") or "Unknown"
    priority = task_row.get("priority") or "Unknown"
    status = task_row.get("status") or "todo"
    created_at = task_row.get("created_at")
    updated_at = task_row.get("updated_at")

    milestone_id = task_row.get("milestone_id")
    has_parent = pd.notna(milestone_id)
    parent_unresolved = bool(has_parent) and milestone_completion.get(int(milestone_id), 0.0) < 1.0

    checklist_total = int(task_row.get("checklist_total") or 0)
    checklist_done = int(task_row.get("checklist_done") or 0)

    status_at_cutoff = STATUS_TO_JIRA_LIKE.get(status, "Open")

    elapsed_hours = _hours_between(created_at, now)
    hours_in_current_status = _hours_between(updated_at, now) if pd.notna(updated_at) else elapsed_hours
    blocked_hours = hours_in_current_status if is_blocked_status(status_at_cutoff) else 0.0

    due_date = task_row.get("due_date")
    milestone_due_date = task_row.get("milestone_due_date")
    deadline = due_date if pd.notna(due_date) else milestone_due_date if pd.notna(milestone_due_date) else None

    if deadline is not None and pd.notna(created_at):
        proxy_deadline_hours = _hours_between(created_at, deadline)
        if proxy_deadline_hours <= 0:
            proxy_deadline_hours = delay_model.proxy_deadline_for(category, priority)
    else:
        proxy_deadline_hours = delay_model.proxy_deadline_for(category, priority)

    progress_ratio = checklist_done / checklist_total if checklist_total > 0 else None
    elapsed_ratio = elapsed_hours / proxy_deadline_hours if proxy_deadline_hours > 0 else 0.0
    imbalance_index = (elapsed_ratio - progress_ratio) if progress_ratio is not None else None
    hours_until_deadline = proxy_deadline_hours - elapsed_hours

    assignee_id = task_row.get("assignee_id")
    assignee_at_cutoff = str(int(assignee_id)) if pd.notna(assignee_id) else "unassigned"

    return {
        "issue_key": f"TASK-{int(task_row['task_id'])}",
        "project_key": f"P{int(task_row['project_id'])}",
        "issuetype_name": category,
        "priority_name": priority,
        "reporter": "unknown",
        "is_subtask": False,
        "has_parent": bool(has_parent),
        "parent_unresolved": parent_unresolved,
        "num_subtasks": checklist_total,
        "num_unresolved_subtasks": max(checklist_total - checklist_done, 0),
        "num_components": 0,
        "num_fixversions": 0,
        "has_released_fixversion": False,
        "num_versions": 0,
        "has_original_estimate": False,
        "original_estimate_seconds": 0,
        "num_issuelinks_total": 0,
        "num_blocked_by_links": 0,
        "num_unresolved_blockers": 0,
        "created_day_of_week": created_at.weekday() if pd.notna(created_at) else -1,
        "created_hour": created_at.hour if pd.notna(created_at) else -1,
        "summary_length": len(title),
        "status_at_cutoff": status_at_cutoff,
        "assignee_at_cutoff": assignee_at_cutoff,
        "num_events_before_cutoff": 0,
        "num_status_changes": 0,
        "num_assignee_changes": 0,
        "num_reopens": 0,
        "hours_in_current_status": hours_in_current_status,
        "blocked_hours_before_cutoff": blocked_hours,
        "blocked_ratio_at_cutoff": blocked_hours / proxy_deadline_hours if proxy_deadline_hours > 0 else 0.0,
        "num_comments_before_cutoff": 0,
        "num_unique_commenters": 0,
        "hours_since_last_comment": elapsed_hours,
        "num_worklog_entries": 0,
        "num_unique_workers": 0,
        "time_spent_seconds_before_cutoff": 0,
        "progress_ratio_at_cutoff": progress_ratio,
        "elapsed_hours_at_cutoff": elapsed_hours,
        "elapsed_ratio_at_cutoff": elapsed_ratio,
        "hours_until_deadline_at_cutoff": hours_until_deadline,
        "imbalance_index_at_cutoff": imbalance_index,
        "activity_count_recent_window": 0,
        "is_self_assigned": False,
    }


def predict_for_task_row(task_row: pd.Series, *, now: pd.Timestamp, milestone_completion: dict[int, float]) -> dict[str, Any]:
    feature_row = build_feature_row(task_row, now=now, milestone_completion=milestone_completion)
    probabilities = delay_model.predict_class_probabilities(feature_row)
    predicted_index = max(range(len(probabilities)), key=lambda i: probabilities[i])
    risk_class = RISK_CLASS_API_LABELS[predicted_index]

    return {
        "task_id": int(task_row["task_id"]),
        "risk_class": risk_class,
        "result": RESULT_KOREAN_LABELS[risk_class],
        "score": round(probabilities[predicted_index], 4),
        "class_probabilities": {RISK_CLASS_API_LABELS[i]: round(p, 4) for i, p in enumerate(probabilities)},
    }


def run_delay_risk_for_project(project_id: int) -> list[dict[str, Any]]:
    """프로젝트의 미완료 업무 전체에 대해 예측을 실행하고 ml_predictions에 적재한 뒤 결과를 반환."""
    engine = get_engine()
    tasks_df = load_tasks_for_project(project_id, engine=engine)
    if tasks_df.empty:
        return []

    pending_df = tasks_df[tasks_df["status"] != "done"]
    if pending_df.empty:
        return []

    # 나머지 시각 컬럼들(created_at 등)이 Postgres TIMESTAMP(타임존 없음)에서 온
    # tz-naive pandas Timestamp이므로, delay_service.py의 datetime.utcnow() 관례를
    # 그대로 따르는 naive datetime을 기준 시각으로 쓴다 (tz-aware와 섞이지 않도록).
    now = datetime.utcnow()
    milestone_completion = _milestone_completion_map(tasks_df)

    predictions = [
        predict_for_task_row(row, now=now, milestone_completion=milestone_completion)
        for _, row in pending_df.iterrows()
    ]

    insert_predictions(project_id, predictions, engine=engine)
    return predictions
