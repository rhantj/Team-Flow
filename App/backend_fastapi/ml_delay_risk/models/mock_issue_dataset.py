"""팀 Supabase 스키마(projects/users/milestones/tasks/task_checklists/task_comments/activities)
형태의 임의 생성(fake) 데이터로 delay_model 학습용 데이터프레임을 구성.

기존에는 Jira MongoDB 데이터셋(dataset_builder.py)으로 학습했지만, 실제 서비스
(delay_service.build_feature_row)는 이 팀의 Supabase 스키마를 읽는다. 이 모듈은 학습에도
`build_feature_row`를 그대로 재사용해서, 학습 피처와 실서비스 피처가 항상 같은 계약을
따르도록 만든다(train/serve skew 원천 차단).

방법론(Jira dataset_builder.py와의 차이):
    - Jira 쪽은 완료된 이슈 하나를 여러 시점(1/3/7/14/30일)에 스냅샷 떠서 classify_risk()
      규칙으로 라벨을 매겼다. 여기서는 라벨(정상/주의/위험)을 업무당 1개만 만들고
      (단일 스냅샷), 목표 라벨을 먼저 정한 뒤 그 라벨에 부합하는 시나리오(마감일 대비 경과
      비율/블로커 체류 비율/체크리스트 진행률)로 데이터를 생성한다 — classify_risk()를
      호출해서 라벨을 "판정"하지 않는다. 데이터를 직접 생성하는 입장이라 규칙의 임계값
      (config.Settings의 risk_blocked_ratio 등)을 라벨별 목표 구간으로 재사용할 뿐이다.
    - 실제 서비스는 항상 완료되지 않은(status != 'done') 업무만 평가하므로(task_delay_service
      실행 시점의 pending_df 필터), 여기서 만드는 학습 행도 전부 완료되지 않은 상태를
      단일 기준 시각(NOW) 시점에서 관찰한 것으로 만든다 — "완료 시점을 가상으로 만들고
      그 이전 임의 지점을 고르는" 컷오프 시뮬레이션이 필요 없다.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Optional

import numpy as np
import pandas as pd

from ml_delay_risk.models.feature_engineering import RISK_CLASS_NAMES
from ml_delay_risk.services.delay_service import build_feature_row

## 1. 상수 정의 — 카테고리/우선순위/기준 시각

# frontend/src/board/libs/types/task.ts의 CatId 18종과 동일.
CATEGORIES = [
    "planning", "research", "ux-ui", "design", "frontend", "backend",
    "ai-ml", "data", "db", "devops", "github", "qa", "security", "docs",
    "presentation", "deliverable", "operation", "other",
]
PRIORITIES = ["high", "medium", "low"]
PRIORITY_WEIGHTS = [0.25, 0.5, 0.25]

TITLE_BY_CATEGORY = {
    "planning": "기획 문서 작성", "research": "레퍼런스 조사", "ux-ui": "UX 플로우 설계",
    "design": "디자인 시안 제작", "frontend": "화면 컴포넌트 구현", "backend": "API 엔드포인트 구현",
    "ai-ml": "모델 학습 파이프라인 구축", "data": "데이터 수집 및 정제", "db": "테이블 스키마 설계",
    "devops": "배포 파이프라인 구성", "github": "PR 리뷰 반영", "qa": "테스트 케이스 작성",
    "security": "보안 점검", "docs": "문서 정리", "presentation": "발표 자료 제작",
    "deliverable": "최종 산출물 정리", "operation": "제출 준비", "other": "기타 업무",
}

# 카테고리별 기준 소요시간(시간) — 실제 완료 데이터가 없으므로(가짜 데이터 자체를 만드는
# 중이라) 상관계수 기반 실측 대신 그럴듯한 값을 고정한다. 우선순위 배수와 곱해
# (category, priority) -> proxy_deadline_hours 맵(운영 시 delay_model.proxy_deadline_for가
# 쓰는 것과 동일한 형태)을 만드는 데 쓴다.
BASELINE_HOURS_BY_CATEGORY = {
    "planning": 40, "research": 40, "ux-ui": 50, "design": 40,
    "frontend": 60, "backend": 80, "ai-ml": 120, "data": 60,
    "db": 40, "devops": 60, "github": 20, "qa": 40,
    "security": 50, "docs": 20, "presentation": 30, "deliverable": 50,
    "operation": 10, "other": 40,
}
PRIORITY_MULTIPLIER = {"high": 0.7, "medium": 1.0, "low": 1.4}

CHECKLIST_TOTAL_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 8]
CHECKLIST_TOTAL_WEIGHTS = [0.10, 0.08, 0.13, 0.16, 0.16, 0.14, 0.10, 0.08, 0.05]

MILESTONE_LINK_PROB = 0.6
UNASSIGNED_PROB = 0.05
NO_DUE_DATE_PROB = 0.2
FILLER_DONE_FRACTION = 0.2
"""마일스톤 완료율(milestone_unresolved 피처)에 현실적인 변동을 주기 위한, 이미 완료된 업무
비중. 학습 행으로는 쓰지 않고 _milestone_completion_map 계산에만 반영한다."""

# 데이터 생성 시각(seed 고정 재현성을 위해 datetime.utcnow() 대신 고정값을 쓴다).
_REFERENCE_NOW = datetime(2026, 7, 20, 9, 0, 0)


## 2. (category, priority) -> proxy_deadline_hours 맵

def _build_proxy_deadline_map() -> tuple[dict[tuple[str, str], float], float]:
    proxy_map = {
        (category, priority): BASELINE_HOURS_BY_CATEGORY[category] * PRIORITY_MULTIPLIER[priority]
        for category in CATEGORIES
        for priority in PRIORITIES
    }
    global_median = float(np.median(list(proxy_map.values())))
    return proxy_map, global_median


## 3. 라벨(정상/주의/위험)별 시나리오 생성 — classify_risk()를 호출하지 않고, 그 규칙이
##    참조하는 임계값(elapsed_ratio/blocked_ratio/imbalance_index)을 목표 구간으로 삼아
##    직접 데이터를 만든다.

def _scenario_targets(rng: np.random.Generator, label: str) -> dict[str, Any]:
    """라벨에 맞춰 (elapsed_ratio, blocked_ratio, status, progress 성향, 마감일 필요 여부,
    활동 정체 여부) 결정.

    <개선책 1 - 정체 신호(stalled) 추가>
    (문제) '주의'(진행저조형)/'위험'(마감초과형) 분기는 status_at_cutoff/blocked_hours가
    '정상'과 완전히 같다(둘 다 inprogress, 블로커 없음) — 구분 신호가 elapsed_hours 대
    마감일 비율(=카테고리별 기준시간과 비교해야 아는 상호작용 신호)뿐이라, 단변량 상관계수
    기반 피처 선정(delay_model.ipynb)이 이 신호를 못 찾고 걸러버려 학습이 두 라벨을
    '정상'과 구분 못 했다(실측: macro F1 0.5 안팎, '주의'/'위험'이 '정상'으로 대거 오분류).
    (해결) 이 두 분기에 "일이 밀리면 최근 활동이 뜸해진다"는 현실적인 신호를 추가한다 —
    stalled=True면 댓글/활동 발생량을 줄이고 마지막 발생 시점을 경과 기간의 앞쪽으로만
    한정해서, num_comments_before_cutoff/hours_since_last_comment/
    activity_count_recent_window 자체가 (상호작용 없이 단독으로도) '정상'과 갈라지는
    마진 신호가 되도록 만든다.
    """
    if label == "정상":
        return {
            "elapsed_ratio": rng.uniform(0.45, 0.77),
            "blocked_ratio": rng.uniform(0.0, 0.08),
            "status": "inprogress",
            "progress_mode": "ontrack",
            "requires_due_date": False,
            "stalled": False,
        }
    if label == "주의":
        if rng.random() < 0.5:
            return {
                "elapsed_ratio": rng.uniform(0.45, 0.77),
                "blocked_ratio": rng.uniform(0.12, 0.28),
                "status": "blocked",
                "progress_mode": "ontrack",
                "requires_due_date": False,
                "stalled": False,
            }
        return {
            "elapsed_ratio": rng.uniform(0.77, 0.98),
            "blocked_ratio": rng.uniform(0.0, 0.08),
            "status": "inprogress",
            "progress_mode": "lagging",
            "requires_due_date": False,
            "stalled": True,
        }
    # 위험
    if rng.random() < 0.5:
        return {
            "elapsed_ratio": rng.uniform(1.05, 1.8),
            "blocked_ratio": rng.uniform(0.0, 0.15),
            "status": "inprogress",
            "progress_mode": "incomplete",
            "requires_due_date": True,
            "stalled": True,
        }
    return {
        "elapsed_ratio": rng.uniform(0.45, 0.77),
        "blocked_ratio": rng.uniform(0.35, 0.7),
        "status": "blocked",
        "progress_mode": "ontrack_despite_block",
        "requires_due_date": False,
        "stalled": False,
    }


def _progress_ratio(rng: np.random.Generator, elapsed_ratio: float, mode: str) -> float:
    if mode == "ontrack":
        value = elapsed_ratio * rng.uniform(0.85, 1.15)
    elif mode == "lagging":
        value = elapsed_ratio - rng.uniform(0.35, 0.55)
    elif mode == "incomplete":
        value = rng.uniform(0.5, 0.95)
    else:  # ontrack_despite_block
        value = elapsed_ratio * rng.uniform(0.7, 1.0)
    return float(np.clip(value, 0.0, 1.0))


## 4. 업무 1건 생성 (학습 행용 — 항상 완료되지 않은 상태)

def _generate_task(
    rng: np.random.Generator,
    task_id: int,
    project_id: int,
    label: str,
    users: list[int],
    milestones: list[tuple[int, datetime]],
    proxy_deadline_map: dict[tuple[str, str], float],
) -> tuple[dict[str, Any], pd.DataFrame, pd.DataFrame]:
    category = rng.choice(CATEGORIES)
    priority = rng.choice(PRIORITIES, p=PRIORITY_WEIGHTS)
    targets = _scenario_targets(rng, label)

    elapsed_hours = float(rng.uniform(24, 24 * 120))
    created_at = _REFERENCE_NOW - timedelta(hours=elapsed_hours)
    due_duration_hours = elapsed_hours / targets["elapsed_ratio"]

    milestone_id: Optional[int] = None
    milestone_due_date: Optional[datetime] = None
    if milestones and rng.random() < MILESTONE_LINK_PROB:
        milestone_id, milestone_due_date = milestones[rng.integers(0, len(milestones))]

    has_due_date = targets["requires_due_date"] or rng.random() >= NO_DUE_DATE_PROB
    due_date = created_at + timedelta(hours=due_duration_hours) if has_due_date else None

    blocked_hours = min(elapsed_hours, targets["blocked_ratio"] * due_duration_hours)
    status = targets["status"]
    # elapsed_ratio가 항상 0.45 이상이라(시나리오 설계상 최소값), "경과시간이 아직 작다"는
    # 조건으로는 todo가 나올 수 없다 — 대신 블로커가 아닌 경우 일정 확률로 "아직 아무도
    # 손대지 않은 채 방치된 업무"(status_at_cutoff 다양성 + 그 자체로 위험 신호)를 만든다.
    status = "todo" if status != "blocked" and rng.random() < 0.15 else status
    updated_at = _REFERENCE_NOW - timedelta(
        hours=blocked_hours if status == "blocked" else rng.uniform(0, elapsed_hours)
    )

    checklist_total = int(rng.choice(CHECKLIST_TOTAL_CHOICES, p=CHECKLIST_TOTAL_WEIGHTS))
    progress_ratio = _progress_ratio(rng, targets["elapsed_ratio"], targets["progress_mode"])
    checklist_done = round(progress_ratio * checklist_total) if checklist_total > 0 else 0

    assignee_id = None if rng.random() < UNASSIGNED_PROB else int(rng.choice(users))

    task_row = {
        "task_id": task_id,
        "project_id": project_id,
        "milestone_id": milestone_id,
        "title": f"{TITLE_BY_CATEGORY[category]} #{task_id}",
        "category": category,
        "status": status,
        "assignee_id": assignee_id,
        "due_date": pd.Timestamp(due_date) if due_date is not None else None,
        "priority": priority,
        "created_at": pd.Timestamp(created_at),
        "updated_at": pd.Timestamp(updated_at),
        "milestone_due_date": pd.Timestamp(milestone_due_date) if milestone_due_date is not None else None,
        "checklist_total": checklist_total,
        "checklist_done": checklist_done,
    }
    comments_df = _generate_comments(rng, created_at, elapsed_hours, users, targets["stalled"])
    activities_df = _generate_activities(rng, created_at, elapsed_hours, status == "blocked", targets["stalled"])
    return task_row, comments_df, activities_df


# stalled=True인 업무는 활동량을 줄이고(STALLED_VOLUME_FACTOR), 마지막 발생 시점을 경과
# 기간의 앞쪽 STALLED_QUIET_TAIL_FRACTION 이후로는 아예 없도록 막아 "최근엔 아무 일도
# 없었다"는 조용한 꼬리를 만든다 — hours_since_last_comment/activity_count_recent_window가
# 실제로 나빠지도록.
STALLED_VOLUME_FACTOR = 0.35
STALLED_QUIET_TAIL_FRACTION = 0.5


def _generate_comments(
    rng: np.random.Generator,
    created_at: datetime,
    elapsed_hours: float,
    users: list[int],
    stalled: bool,
) -> pd.DataFrame:
    lam = max(0.2, elapsed_hours / 72)
    if stalled:
        lam *= STALLED_VOLUME_FACTOR
    num_comments = min(int(rng.poisson(lam)), 15)
    if num_comments == 0:
        return pd.DataFrame(columns=["author_id", "created_at"])
    max_offset = elapsed_hours * (1 - STALLED_QUIET_TAIL_FRACTION) if stalled else elapsed_hours
    offsets = rng.uniform(0, max_offset, size=num_comments)
    return pd.DataFrame({
        "author_id": rng.choice(users, size=num_comments),
        "created_at": [pd.Timestamp(created_at + timedelta(hours=float(h))) for h in offsets],
    })


def _generate_activities(
    rng: np.random.Generator,
    created_at: datetime,
    elapsed_hours: float,
    is_blocked: bool,
    stalled: bool,
) -> pd.DataFrame:
    lam = max(0.3, elapsed_hours / 36) + (2.0 if is_blocked else 0.0)
    if stalled:
        lam *= STALLED_VOLUME_FACTOR
    num_events = min(int(rng.poisson(lam)), 20)
    if num_events == 0:
        return pd.DataFrame(columns=["created_at"])
    max_offset = elapsed_hours * (1 - STALLED_QUIET_TAIL_FRACTION) if stalled else elapsed_hours
    offsets = rng.uniform(0, max_offset, size=num_events)
    return pd.DataFrame({
        "created_at": [pd.Timestamp(created_at + timedelta(hours=float(h))) for h in offsets],
    })


## 5. 마일스톤 완료율 현실감을 위한 필러(완료된) 업무 — 학습 행에는 포함되지 않음

def _generate_filler_done_task(
    rng: np.random.Generator, task_id: int, project_id: int, milestones: list[tuple[int, datetime]]
) -> dict[str, Any]:
    milestone_id = milestones[rng.integers(0, len(milestones))][0] if milestones else None
    return {"task_id": task_id, "project_id": project_id, "milestone_id": milestone_id, "status": "done"}


def _milestone_completion_map(rows: list[dict[str, Any]]) -> dict[int, float]:
    totals: dict[int, int] = {}
    done: dict[int, int] = {}
    for row in rows:
        milestone_id = row.get("milestone_id")
        if milestone_id is None:
            continue
        totals[milestone_id] = totals.get(milestone_id, 0) + 1
        if row.get("status") == "done":
            done[milestone_id] = done.get(milestone_id, 0) + 1
    return {mid: done.get(mid, 0) / total for mid, total in totals.items()}


## 6. 프로젝트/유저/마일스톤 모집단 생성

def _build_population(
    rng: np.random.Generator, num_projects: int
) -> tuple[list[int], dict[int, list[int]], dict[int, list[tuple[int, datetime]]]]:
    projects = list(range(1, num_projects + 1))
    users_by_project: dict[int, list[int]] = {}
    milestones_by_project: dict[int, list[tuple[int, datetime]]] = {}

    next_user_id = 1
    next_milestone_id = 1
    for project_id in projects:
        num_users = int(rng.integers(4, 9))
        users_by_project[project_id] = list(range(next_user_id, next_user_id + num_users))
        next_user_id += num_users

        num_milestones = int(rng.integers(3, 7))
        milestones = []
        for _ in range(num_milestones):
            due = _REFERENCE_NOW + timedelta(days=float(rng.uniform(-20, 45)))
            milestones.append((next_milestone_id, due))
            next_milestone_id += 1
        milestones_by_project[project_id] = milestones

    return projects, users_by_project, milestones_by_project


## 7. 정합성 검증 — 생성 직후 바로 확인 (버그가 있으면 여기서 바로 걸린다)

def _validate_dataframe(df: pd.DataFrame, expected_labels: set[str]) -> None:
    assert set(df["risk_class"].unique()) == expected_labels, "예상 밖의 risk_class 값이 있습니다"
    assert (df["num_unresolved_subtasks"] >= 0).all(), "checklist_done이 checklist_total을 초과했습니다"
    assert (df["elapsed_hours_at_cutoff"] >= 0).all(), "음수 경과시간이 있습니다"
    assert df["risk_class"].value_counts().nunique() == 1, "risk_class 클래스별 개수가 균형이 아닙니다"


## 8. 최종 진입점 — delay_model.ipynb cell 14가 호출

def build_training_dataframe(
    limit: int = 4500, num_projects: int = 12, seed: int = 42
) -> tuple[pd.DataFrame, dict[tuple[str, str], float], float]:
    """가짜 Supabase 데이터로 학습용 데이터프레임을 만든다.

    반환값은 dataset_builder.build_training_dataframe(Jira/MongoDB)과 동일한
    (df, proxy_deadline_map, global_median) 3-튜플이라, delay_model.ipynb cell 14는
    import 한 줄만 바꾸면 된다. limit은 3의 배수로 맞춰 정상/주의/위험 각 클래스 개수를
    동일하게 만든다(요청된 "균형 샘플링").
    """
    rng = np.random.default_rng(seed)
    proxy_deadline_map, global_median = _build_proxy_deadline_map()

    def _proxy_lookup(category: str, priority: str) -> float:
        return proxy_deadline_map.get((category, priority), global_median)

    labels = list(RISK_CLASS_NAMES.values())  # ["정상", "주의", "위험"]
    per_class = max(1, limit // len(labels))
    total_training = per_class * len(labels)
    filler_count = round(total_training * FILLER_DONE_FRACTION)

    projects, users_by_project, milestones_by_project = _build_population(rng, num_projects)

    label_sequence = labels * per_class
    rng.shuffle(label_sequence)

    task_rows: list[dict[str, Any]] = []
    comments_by_task: dict[int, pd.DataFrame] = {}
    activities_by_task: dict[int, pd.DataFrame] = {}
    task_labels: dict[int, str] = {}
    next_task_id = 1

    for label in label_sequence:
        project_id = int(rng.choice(projects))
        row, comments_df, activities_df = _generate_task(
            rng, next_task_id, project_id, label,
            users_by_project[project_id], milestones_by_project[project_id], proxy_deadline_map,
        )
        task_rows.append(row)
        comments_by_task[next_task_id] = comments_df
        activities_by_task[next_task_id] = activities_df
        task_labels[next_task_id] = label
        next_task_id += 1

    filler_rows = []
    for _ in range(filler_count):
        project_id = int(rng.choice(projects))
        filler_rows.append(
            _generate_filler_done_task(rng, next_task_id, project_id, milestones_by_project[project_id])
        )
        next_task_id += 1

    milestone_completion = _milestone_completion_map(task_rows + filler_rows)

    feature_rows = []
    for row in task_rows:
        feature_row = build_feature_row(
            pd.Series(row),
            now=_REFERENCE_NOW,
            milestone_completion=milestone_completion,
            comments=comments_by_task[row["task_id"]],
            activities=activities_by_task[row["task_id"]],
            proxy_deadline_lookup=_proxy_lookup,
        )
        feature_row["created"] = row["created_at"]
        feature_row["risk_class"] = task_labels[row["task_id"]]
        feature_rows.append(feature_row)

    df = pd.DataFrame(feature_rows)
    _validate_dataframe(df, expected_labels=set(labels))
    return df, proxy_deadline_map, global_median
