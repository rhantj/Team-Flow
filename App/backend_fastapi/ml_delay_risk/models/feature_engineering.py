"""이슈 문서 + 시점(cutoff) 기준 events/comments/worklogs로부터 피처와 3단계 라벨을 계산.

학습과 추론이 이 함수들을 그대로 공유한다 (train/serve skew 방지).
모든 동적 피처는 cutoff 이전 데이터만 사용해 데이터 누수(leakage)를 막는다.

방법론 문서 기준 3단계 타겟:
    Class 0 (정상): 마감일(Proxy Deadline) 이내에서 순항 중.
    Class 1 (주의): 마감일 이내지만 진행률이 저조하거나 블로커 상태에 짧게 머묾.
    Class 2 (위험): 마감일을 초과했거나, 블로커 상태에 장기간 머물러 활동이 정지(Silent).

이 데이터셋에는 명시적 마감일(Due date) 필드가 없어(방법론 문서의 '현실적 한계'),
동일 (issuetype, priority) 그룹의 과거 처리시간 중앙값을 Proxy Deadline으로 대체하는
우회 전략을 사용한다. 라벨은 그 시점(cutoff)까지 관측 가능한 값만으로 계산하므로,
완료된 이슈의 '최종' 결과를 참조하지 않는다(=예측 시점에 재현 가능=누수 없음).
"""

from __future__ import annotations

"""
# Feature Descriptions (피처 설명 목록)

| 피처명 (Feature Name) | 설명 (Description) |
| :--- | :--- |
| `project_key` | 프로젝트 코드 (이슈 키 접두사, 예: JELLY) |
| `issuetype_name` | 이슈 유형 (Bug/Task/Improvement 등) |
| `priority_name` | 우선순위 (Blocker/Critical/Major/Minor/Trivial) |
| `reporter` | 이슈 등록자 (빈도 인코딩) |
| `is_subtask` | 하위 작업(subtask) 여부 |
| `has_parent` | 상위 이슈(에픽 등)에 속해 있는지 여부 |
| `parent_unresolved` | 상위 이슈(에픽)가 아직 미해결 상태인지 여부 |
| `num_subtasks` | 하위 작업 개수 |
| `num_unresolved_subtasks` | 하위 작업 중 미해결 개수 |
| `num_components` | 소속 컴포넌트(모듈) 개수 |
| `num_fixversions` | 목표 릴리즈 버전 개수 |
| `has_released_fixversion` | 목표 릴리즈 버전 중 이미 배포된 것이 있는지 여부 |
| `num_versions` | 영향받는 버전 개수 |
| `has_original_estimate` | 최초 예상 소요시간(estimate)이 설정되어 있는지 여부 |
| `original_estimate_seconds` | 최초 예상 소요시간(초 단위) |
| `num_issuelinks_total` | 다른 이슈와의 연관관계 총 개수 |
| `num_blocked_by_links` | '~에 의해 막힘' 관계 개수 |
| `num_unresolved_blockers` | 블로커 이슈 중 아직 해결되지 않은 것의 개수 |
| `created_day_of_week` | 생성 요일 (0=월요일 ~ 6=일요일) |
| `created_hour` | 생성 시각 (0~23시) |
| `summary_length` | 이슈 제목 길이 (문자 수, 복잡도 근사치) |
| `status_at_cutoff` | cutoff 시점의 상태 (Open/In Progress/Blocked 등) |
| `assignee_at_cutoff` | cutoff 시점의 담당자 (빈도 인코딩) |
| `num_events_before_cutoff` | cutoff 이전 변경 이력(이벤트) 총 개수 |
| `num_status_changes` | 상태 변경 횟수 |
| `num_assignee_changes` | 담당자 변경(재배정) 횟수 |
| `num_reopens` | 상태가 Open/Reopened로 되돌아간 횟수 |
| `hours_in_current_status` | 마지막 상태 변경 이후 ~ cutoff까지 경과한 시간 |
| `blocked_hours_before_cutoff` | 블로커 상태에 머문 누적 시간 |
| `num_comments_before_cutoff` | cutoff 이전 댓글 수 |
| `num_unique_commenters` | 댓글을 남긴 고유 인원 수 |
| `hours_since_last_comment` | 마지막 댓글로부터 ~ cutoff까지 경과 시간 |
| `num_worklog_entries` | 작업 기록(worklog) 건수 (봇 계정 제외) |
| `num_unique_workers` | 실제 작업한 고유 인원 수 |
| `time_spent_seconds_before_cutoff` | cutoff까지 누적 투입 시간 (초, 봇 제외) |
| `progress_ratio_at_cutoff` | 진행률 (누적 투입시간 ÷ 최초 예상시간) |
| `elapsed_hours_at_cutoff` | 이슈 생성 후 ~ cutoff까지 경과 시간 (절대값, 시간 단위) |
| `activity_count_recent_window` | 최근 N일간 활동(댓글+상태변경+작업기록) 합계 |
| `is_self_assigned` | 보고자와 담당자가 동일 인물인지 여부 |
| `snapshot_offset_days` | 스냅샷 시점 (이슈 생성 후 며칠째인지) |
"""

from datetime import datetime, timedelta
from typing import Any, Callable, Optional

from ml_delay_risk.models.bot_filter import author_identifier

# 스키마 문서의 '정상 완료(Class 0 후보)' 표에 나열된 resolution.name 값들.
# 이 값이 아닌 이슈(Duplicate, Won't Fix, 미해결 등)는 학습 대상에서 제외한다.
NORMAL_RESOLUTIONS = [
    "Fixed",
    "Done",
    "Resolved",
    "Implemented",
    "Delivered",
    "Staged",
    "Workaround",
]

CLOSED_STATUS_NAMES = {"resolved", "closed", "done"}
BLOCKED_STATUS_MARKERS = ("block", "wait", "hold", "impediment")
BLOCKED_BY_LABELS = {"is blocked by", "blocked by"}

RISK_CLASS_NAMES = {0: "정상", 1: "주의", 2: "위험"}
"""학습 리포트(classification_report 등) 표기용."""
RISK_CLASS_API_LABELS = {0: "NORMAL", 1: "CAUTION", 2: "DANGER"}
"""API 응답/스키마 계약용 (프론트엔드 등 외부 소비자가 참조하는 값)."""


def _nested_name(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        return value.get("name")
    return None


def is_blocked_status(status_name: Optional[str]) -> bool:
    lowered = (status_name or "").lower()
    return any(marker in lowered for marker in BLOCKED_STATUS_MARKERS)


def parse_project_key(issue_key: Optional[str]) -> str:
    if not issue_key or "-" not in issue_key:
        return "UNKNOWN"
    return issue_key.split("-", 1)[0]


def count_blocked_by_links(issuelinks: list[dict]) -> tuple[int, int]:
    """(전체 '~에 의해 막힘' 링크 수, 그 중 아직 해결되지 않은 링크 수)."""
    total = 0
    unresolved = 0
    for link in issuelinks or []:
        link_type = link.get("type") or {}
        inward_issue = link.get("inwardIssue")
        if inward_issue and (link_type.get("inward") or "").strip().lower() in BLOCKED_BY_LABELS:
            total += 1
            status_name = _nested_name((inward_issue.get("fields") or {}).get("status")) or ""
            if status_name.strip().lower() not in CLOSED_STATUS_NAMES:
                unresolved += 1
    return total, unresolved


def count_unresolved_subtasks(subtasks: list[dict]) -> int:
    """하위 작업 중 아직 해결되지 않은 것의 개수.

    설계 문서: "하위 태스크 중 하나라도 지연되면 부모 이슈 전체가 지연될 확률이 높다."
    issuelinks의 inwardIssue와 동일하게 각 서브태스크 항목에 fields.status 스냅샷이
    포함되어 있다고 가정한다(Jira REST API 표준 구조). 스냅샷이 없는 경우 안전하게 0으로 처리.
    """
    unresolved = 0
    for subtask in subtasks or []:
        status_name = _nested_name((subtask.get("fields") or {}).get("status")) or ""
        if status_name and status_name.strip().lower() not in CLOSED_STATUS_NAMES:
            unresolved += 1
    return unresolved


def is_parent_unresolved(parent: Optional[dict]) -> bool:
    """상위 이슈(에픽 등)가 아직 해결되지 않은 상태인지. parent가 없으면 False."""
    if not parent:
        return False
    status_name = _nested_name((parent.get("fields") or {}).get("status")) or ""
    return bool(status_name) and status_name.strip().lower() not in CLOSED_STATUS_NAMES


def has_released_fixversion(fix_versions: list[dict]) -> bool:
    """목표 릴리즈 버전 중 이미 배포 완료(released=True)된 것이 있는지.

    목표 버전이 이미 배포됐는데 이 이슈가 아직 안 끝났다면, 그 버전에 맞춰
    끝내지 못했다는(=이미 지연) 강한 신호다.
    """
    return any(bool(fv.get("released")) for fv in fix_versions or [])


"""이슈 생성 시점부터 거의 변하지 않는(또는 스냅샷 시점 근사가 어려운) 필드."""
def build_static_features(issue: dict[str, Any]) -> dict[str, Any]:
    issuetype = issue.get("issuetype") or {}
    priority = issue.get("priority") or {}
    timetracking = issue.get("timetracking") or {}
    created = issue.get("created")
    fix_versions = issue.get("fixVersions") or []

    original_estimate_seconds = timetracking.get("originalEstimateSeconds") or 0
    total_blocked_by, unresolved_blocked_by = count_blocked_by_links(issue.get("issuelinks") or [])

    return {
        "issue_key": issue.get("key") or issue.get("id"),
        "project_key": parse_project_key(issue.get("key")),
        "issuetype_name": issuetype.get("name") or "Unknown",
        "priority_name": priority.get("name") or "Unknown",
        "reporter": issue.get("reporter") or "unknown",
        "is_subtask": bool(issuetype.get("subtask")),
        "has_parent": bool(issue.get("parent")),
        "parent_unresolved": is_parent_unresolved(issue.get("parent")),
        "num_subtasks": len(issue.get("subtasks") or []),
        "num_unresolved_subtasks": count_unresolved_subtasks(issue.get("subtasks") or []),
        "num_components": len(issue.get("components") or []),
        "num_fixversions": len(fix_versions),
        "has_released_fixversion": has_released_fixversion(fix_versions),
        "num_versions": len(issue.get("versions") or []),
        "has_original_estimate": original_estimate_seconds > 0,
        "original_estimate_seconds": original_estimate_seconds,
        "num_issuelinks_total": len(issue.get("issuelinks") or []),
        "num_blocked_by_links": total_blocked_by,
        "num_unresolved_blockers": unresolved_blocked_by,
        "created_day_of_week": created.weekday() if created else -1,
        "created_hour": created.hour if created else -1,
        "summary_length": len(issue.get("summary") or ""),
    }


def _status_time_breakdown(
    events: list[dict], created: datetime, cutoff: datetime
) -> dict[str, float]:
    """created~cutoff 구간 동안 각 status에 머문 누적 시간(시간 단위)."""
    status_events = sorted(
        (
            (event["created"], item.get("toString") or "Unknown")
            for event in events
            if event.get("created")
            for item in (event.get("items") or [])
            if (item.get("field") or "").lower() == "status"
        ),
        key=lambda pair: pair[0],
    )

    breakdown: dict[str, float] = {}
    current_status = "Open"  # Jira 기본 워크플로우의 초기 상태로 근사
    segment_start = created

    for timestamp, new_status in status_events:
        if timestamp < segment_start:
            continue
        hours = max((timestamp - segment_start).total_seconds() / 3600, 0.0)
        breakdown[current_status] = breakdown.get(current_status, 0.0) + hours
        current_status = new_status
        segment_start = timestamp

    hours = max((cutoff - segment_start).total_seconds() / 3600, 0.0)
    breakdown[current_status] = breakdown.get(current_status, 0.0) + hours
    return breakdown


def classify_risk(
    *,
    elapsed_ratio: float,
    blocked_ratio: float,
    imbalance_index: Optional[float],
    risk_blocked_ratio: float,
    warning_blocked_ratio: float,
    warning_imbalance_index: float,
) -> int:
    """방법론 문서의 3단계 기준을 그대로 규칙화.

    모든 입력이 cutoff 시점까지만 관측 가능한 값이므로(최종 결과 미참조),
    학습 시점 라벨링과 실시간 추론 시 위험도 판정에 동일하게 쓸 수 있다.
    """
    if elapsed_ratio > 1.0:
        return 2  # 위험: Proxy Deadline 초과
    if blocked_ratio > risk_blocked_ratio:
        return 2  # 위험: 블로커 상태에 장기간 정체(Silent)
    if blocked_ratio > warning_blocked_ratio:
        return 1  # 주의: 블로커 상태에 일정 기간 머묾
    if imbalance_index is not None and imbalance_index > warning_imbalance_index:
        return 1  # 주의: 경과 시간 대비 진행률 저조
    return 0  # 정상


"""이슈 생성 이후 변동하는 필드."""
def build_dynamic_features(
    *,
    created: datetime,
    cutoff: datetime,
    events: list[dict],
    comments: list[dict],
    worklogs: list[dict],
    original_estimate_seconds: float,
    proxy_deadline_hours: float,
    current_assignee: Optional[str],
    is_bot_author: Callable[[Any], bool],
    recent_activity_window_days: int,  ## N=3일
) -> dict[str, Any]:
    """cutoff 시점까지의 events/comments/worklogs만으로 계산하는 시계열 피처."""
    ordered_events = sorted((e for e in events if e.get("created")), key=lambda e: e["created"])

    status_at_cutoff: Optional[str] = None
    assignee_at_cutoff: Optional[str] = None
    last_status_change_at = created
    num_status_changes = 0
    num_assignee_changes = 0
    num_reopens = 0

    for event in ordered_events:
        for item in event.get("items") or []:
            field_name = (item.get("field") or "").lower()
            if field_name == "status":
                num_status_changes += 1
                status_at_cutoff = item.get("toString") or status_at_cutoff
                last_status_change_at = event["created"]
                if (item.get("toString") or "").strip().lower() in {"open", "reopened"}:
                    num_reopens += 1
            elif field_name == "assignee":
                num_assignee_changes += 1
                assignee_at_cutoff = item.get("toString") or assignee_at_cutoff

    # cutoff 이전에 담당자 변경 이력이 없으면(=한 번도 재배정되지 않음) 현재 담당자로 근사.
    # status는 반대로 '현재 상태'로 근사하면 누수가 되므로 변경 이력이 없을 때 초기 상태(Open)로 둔다.
    assignee_at_cutoff = assignee_at_cutoff or current_assignee or "unassigned"
    status_at_cutoff = status_at_cutoff or "Open"

    hours_in_current_status = max((cutoff - last_status_change_at).total_seconds() / 3600, 0.0)

    # 상태별 체류 시간 (Time in Status) — '블로커/대기' 상태 누적 시간을 라벨/피처 양쪽에 사용
    status_breakdown = _status_time_breakdown(ordered_events, created, cutoff)
    blocked_hours = sum(hours for name, hours in status_breakdown.items() if is_blocked_status(name))

    ordered_comments = [c for c in comments if c.get("created")]
    unique_commenters = {
        normalized_author
        for c in ordered_comments
        if (normalized_author := author_identifier(c.get("author")))
    }
    if ordered_comments:
        last_comment_at = max(c["created"] for c in ordered_comments)
        hours_since_last_comment = max((cutoff - last_comment_at).total_seconds() / 3600, 0.0)
    else:
        hours_since_last_comment = max((cutoff - created).total_seconds() / 3600, 0.0)

    human_worklogs = [w for w in worklogs if not is_bot_author(w.get("author"))]
    time_spent_seconds = sum(w.get("timeSpentSeconds") or 0 for w in human_worklogs)
    unique_workers = {
        normalized_author
        for w in human_worklogs
        if (normalized_author := author_identifier(w.get("author")))
    }

    # 진행률 불균형 지수 (Progress-Time Ratio)
    progress_ratio = (
        time_spent_seconds / original_estimate_seconds if original_estimate_seconds > 0 else None
    )
    elapsed_hours = max((cutoff - created).total_seconds() / 3600, 0.0)
    elapsed_ratio = elapsed_hours / proxy_deadline_hours if proxy_deadline_hours > 0 else 0.0
    imbalance_index = (elapsed_ratio - progress_ratio) if progress_ratio is not None else None
    blocked_ratio = blocked_hours / proxy_deadline_hours if proxy_deadline_hours > 0 else 0.0
    hours_until_deadline = proxy_deadline_hours - elapsed_hours

    # 최근 활동 모멘텀: 기한 임박 + 최근 N=3일간 무활동은 '위험'의 강력한 전조
    window_start = cutoff - timedelta(days=recent_activity_window_days)
    recent_comments = sum(1 for c in ordered_comments if c["created"] >= window_start)
    recent_status_or_assignee_events = sum(
        1
        for e in ordered_events
        for item in (e.get("items") or [])
        if (item.get("field") or "").lower() in {"status", "assignee"}
        and e.get("created")
        and e["created"] >= window_start
    )
    recent_worklogs = sum(
        1
        for w in human_worklogs
        if w.get("started") and w["started"] >= window_start
    )
    activity_count_recent_window = recent_comments + recent_status_or_assignee_events + recent_worklogs

    return {
        "status_at_cutoff": status_at_cutoff,
        "assignee_at_cutoff": assignee_at_cutoff,
        "num_events_before_cutoff": len(ordered_events),
        "num_status_changes": num_status_changes,
        "num_assignee_changes": num_assignee_changes,
        "num_reopens": num_reopens,
        "hours_in_current_status": hours_in_current_status,
        "blocked_hours_before_cutoff": blocked_hours,
        "blocked_ratio_at_cutoff": blocked_ratio,
        "num_comments_before_cutoff": len(ordered_comments),
        "num_unique_commenters": len(unique_commenters),
        "hours_since_last_comment": hours_since_last_comment,
        "num_worklog_entries": len(human_worklogs),
        "num_unique_workers": len(unique_workers),
        "time_spent_seconds_before_cutoff": time_spent_seconds,
        "progress_ratio_at_cutoff": progress_ratio,
        "elapsed_hours_at_cutoff": elapsed_hours,
        "elapsed_ratio_at_cutoff": elapsed_ratio,
        "hours_until_deadline_at_cutoff": hours_until_deadline,
        "imbalance_index_at_cutoff": imbalance_index,
        "activity_count_recent_window": activity_count_recent_window,
    }


def compute_cross_features(
    static_features: dict[str, Any], dynamic_features: dict[str, Any]
) -> dict[str, Any]:
    """정적 피처와 동적 피처를 모두 알아야 계산 가능한 파생 피처.

    학습(dataset_builder)과 실시간 추론(delay_service) 양쪽이 이 함수를 그대로
    호출해야 train/serve skew가 생기지 않는다.
    """
    reporter = static_features.get("reporter")
    assignee = dynamic_features.get("assignee_at_cutoff")
    is_self_assigned = bool(reporter) and bool(assignee) and reporter == assignee

    return {
        "is_self_assigned": is_self_assigned,
    }
