"""진행 중(Open/In Progress) 이슈에 대한 실시간 3단계(정상/주의/위험) 위험도 추론."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException

from ml_delay_risk.models.bot_filter import is_bot_author
from ml_delay_risk.models.feature_engineering import (
    RISK_CLASS_API_LABELS,
    build_dynamic_features,
    build_static_features,
    compute_cross_features,
)
from ml_delay_risk.models import delay_model
from ml_delay_risk.models.mongo_client import get_database
from ml_delay_risk.models.snapshot_repository import fetch_snapshot
from ml_delay_risk.config import get_settings


def _fetch_issue(issue_key: str) -> dict[str, Any]:
    settings = get_settings()
    db = get_database()
    issue = db[settings.issues_collection].find_one({"key": issue_key})
    if issue is None:
        issue = db[settings.issues_collection].find_one({"_id": issue_key})
    if issue is None:
        raise HTTPException(status_code=404, detail=f"이슈를 찾을 수 없습니다: {issue_key}")
    return issue


def predict_for_issue(issue_key: str) -> dict[str, Any]:
    settings = get_settings()
    db = get_database()
    issue = _fetch_issue(issue_key)

    created = issue.get("created")
    if created is None:
        raise HTTPException(
            status_code=422, detail=f"이슈에 생성일(created)이 없어 예측할 수 없습니다: {issue_key}"
        )

    static_features = build_static_features(issue)
    proxy_deadline_hours = delay_model.proxy_deadline_for(
        static_features["issuetype_name"], static_features["priority_name"]
    )

    cutoff = datetime.utcnow()
    events, comments, worklogs = fetch_snapshot(db, issue, cutoff)

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
    cross_features = compute_cross_features(static_features, dynamic_features)

    # snapshot_offset_days는 학습 시 고정 체크포인트(1/3/7/14/30일)였지만, 실시간
    # 추론에서는 실제 경과일(연속값)로 대체한다 — 트리 분할 임계값에는 문제 없이 들어맞는다.
    feature_row = {
        **static_features,
        **dynamic_features,
        **cross_features,
        "snapshot_offset_days": dynamic_features["elapsed_hours_at_cutoff"] / 24.0,
    }

    probabilities = delay_model.predict_class_probabilities(feature_row)
    predicted_index = max(range(len(probabilities)), key=lambda i: probabilities[i])

    return {
        "issue_key": static_features["issue_key"],
        "risk_class": RISK_CLASS_API_LABELS[predicted_index],
        "class_probabilities": {
            RISK_CLASS_API_LABELS[i]: round(p, 4) for i, p in enumerate(probabilities)
        },
        "elapsed_hours": round(dynamic_features["elapsed_hours_at_cutoff"], 2),
        "hours_until_deadline": round(dynamic_features["hours_until_deadline_at_cutoff"], 2),
        "blocked_hours": round(dynamic_features["blocked_hours_before_cutoff"], 2),
        "original_estimate_hours": (
            round(static_features["original_estimate_seconds"] / 3600, 2)
            if static_features["has_original_estimate"]
            else None
        ),
    }
