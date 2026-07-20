"""MongoDB(ml_dashboard)에서 3단계(정상/주의/위험) 분류 학습용 데이터프레임을 구성.

2-패스 구조:
    1) 가벼운 프로젝션 쿼리로 완료 이슈들의 (issuetype, priority, 소요시간)만 모아
       Proxy Deadline(그룹 중앙값)을 계산한다 — 이 데이터셋엔 실제 마감일 필드가
       없어, 방법론 문서가 권고하는 '과거 유사 티켓 평균 해결시간을 가상의
       마감일로 대체'하는 우회 전략을 그대로 구현한 것.
    2) 이슈 하나당 events/comments/worklogs를 한 번만 가져온 뒤, 여러 스냅샷
       시점(생성 후 1/3/7/14/30일)마다 그 시점까지의 데이터로 피처와 라벨을
       계산한다. 스냅샷별로 Mongo를 다시 조회하지 않고 메모리에서 슬라이싱한다.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Optional

import pandas as pd
from pymongo.database import Database

from ml_delay_risk.models.bot_filter import is_bot_author
from ml_delay_risk.models.feature_engineering import (
    NORMAL_RESOLUTIONS,
    build_dynamic_features,
    build_static_features,
    classify_risk,
    compute_cross_features,
)
from ml_delay_risk.models.mongo_client import ensure_indexes, get_database
from ml_delay_risk.models.snapshot_repository import fetch_snapshot, filter_before
from ml_delay_risk.config import Settings, get_settings

logger = logging.getLogger(__name__)

_ISSUE_QUERY = {
    "resolution.name": {"$in": NORMAL_RESOLUTIONS},
    "resolutiondate": {"$exists": True, "$ne": None},
    "created": {"$exists": True, "$ne": None},
}


def build_proxy_deadline_map(
    db: Database, settings: Settings, limit: Optional[int] = None
) -> tuple[dict[tuple[str, str], float], float]:
    """(issuetype, priority) -> Proxy Deadline(시간) 그룹 중앙값과 전역 중앙값."""
    projection = {
        "issuetype.name": 1,
        "priority.name": 1,
        "created": 1,
        "resolutiondate": 1,
    }
    cursor = db[settings.issues_collection].find(_ISSUE_QUERY, projection)
    if limit:
        cursor = cursor.sort("$natural", 1).limit(limit)

    rows = []
    for issue in cursor:
        created = issue.get("created")
        resolved = issue.get("resolutiondate")
        if created is None or resolved is None or resolved <= created:
            continue
        duration_hours = (resolved - created).total_seconds() / 3600
        if duration_hours < settings.min_duration_hours:
            continue
        rows.append(
            {
                "issuetype_name": (issue.get("issuetype") or {}).get("name") or "Unknown",
                "priority_name": (issue.get("priority") or {}).get("name") or "Unknown",
                "duration_hours": duration_hours,
            }
        )

    if not rows:
        return {}, 0.0

    df = pd.DataFrame(rows)
    global_median = float(df["duration_hours"].median())

    grouped = df.groupby(["issuetype_name", "priority_name"])["duration_hours"]
    group_medians = grouped.median()
    group_counts = grouped.count()

    proxy_map: dict[tuple[str, str], float] = {}
    for key, median in group_medians.items():
        proxy_map[key] = float(median) if group_counts[key] >= settings.min_group_size_for_sla else global_median

    logger.info(
        "Proxy Deadline 계산 완료: 그룹 %d개, 전역 중앙값 %.1f시간 (표본 %d건)",
        len(proxy_map),
        global_median,
        len(df),
    )
    return proxy_map, global_median


def _proxy_deadline_for(
    proxy_map: dict[tuple[str, str], float], global_median: float, issuetype_name: str, priority_name: str
) -> float:
    return proxy_map.get((issuetype_name, priority_name), global_median)


def build_training_dataframe(
    limit: Optional[int] = None,
) -> tuple[pd.DataFrame, dict[tuple[str, str], float], float]:
    settings = get_settings()
    ensure_indexes()
    db = get_database()

    proxy_map, global_median = build_proxy_deadline_map(db, settings, limit=limit)
    if global_median <= 0:
        logger.warning("Proxy Deadline을 계산할 데이터가 없습니다.")
        return pd.DataFrame(), proxy_map, global_median

    cursor = db[settings.issues_collection].find(_ISSUE_QUERY)
    if limit:
        cursor = cursor.sort("$natural", 1).limit(limit)

    rows: list[dict[str, Any]] = []
    issues_scanned = 0
    for issue in cursor:
        issues_scanned += 1
        rows.extend(_build_rows_for_issue(db, issue, settings, proxy_map, global_median))

    df = pd.DataFrame(rows)
    logger.info(
        "완료 이슈 %d건에서 스냅샷 %d행 생성", issues_scanned, len(df)
    )
    if df.empty:
        return df, proxy_map, global_median

    logger.info("클래스 분포:\n%s", df["risk_class"].value_counts().sort_index())
    return df, proxy_map, global_median


def _build_rows_for_issue(
    db: Database,
    issue: dict[str, Any],
    settings: Settings,
    proxy_map: dict[tuple[str, str], float],
    global_median: float,
) -> list[dict[str, Any]]:
    created = issue.get("created")
    resolved = issue.get("resolutiondate")
    if created is None or resolved is None or resolved <= created:
        return []

    static_features = build_static_features(issue)
    proxy_deadline_hours = _proxy_deadline_for(
        proxy_map, global_median, static_features["issuetype_name"], static_features["priority_name"]
    )
    if proxy_deadline_hours <= 0:
        return []

    candidate_cutoffs = [
        created + timedelta(days=offset) for offset in settings.snapshot_offsets_days
    ]
    candidate_cutoffs = [c for c in candidate_cutoffs if c < resolved]
    if not candidate_cutoffs:
        return []

    max_cutoff = max(candidate_cutoffs)
    all_events, all_comments, all_worklogs = fetch_snapshot(db, issue, max_cutoff)

    rows: list[dict[str, Any]] = []
    for offset_days, cutoff in zip(settings.snapshot_offsets_days, candidate_cutoffs):
        events = filter_before(all_events, "created", cutoff)
        comments = filter_before(all_comments, "created", cutoff)
        worklogs = filter_before(all_worklogs, "started", cutoff)

        dynamic_features = build_dynamic_features(
            created=created,
            cutoff=cutoff,
            events=events,
            comments=comments,
            worklogs=worklogs,
            original_estimate_seconds=static_features["original_estimate_seconds"],
            proxy_deadline_hours=proxy_deadline_hours,
            current_assignee=issue.get("assignee"),
            is_bot_author=is_bot_author,
            recent_activity_window_days=settings.recent_activity_window_days,
        )

        risk_class = classify_risk(
            elapsed_ratio=dynamic_features["elapsed_ratio_at_cutoff"],
            blocked_ratio=dynamic_features["blocked_ratio_at_cutoff"],
            imbalance_index=dynamic_features["imbalance_index_at_cutoff"],
            risk_blocked_ratio=settings.risk_blocked_ratio,
            warning_blocked_ratio=settings.warning_blocked_ratio,
            warning_imbalance_index=settings.warning_imbalance_index,
        )

        cross_features = compute_cross_features(static_features, dynamic_features)

        rows.append(
            {
                **static_features,
                **dynamic_features,
                **cross_features,
                "created": created,
                "snapshot_offset_days": offset_days,
                "proxy_deadline_hours": proxy_deadline_hours,
                "risk_class": risk_class,
            }
        )

    return rows
