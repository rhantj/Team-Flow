"""이슈 하나에 대한 특정 시점(cutoff) 이전 events/comments/worklogs 조회.

학습(과거 완료 이슈의 여러 스냅샷 시점)과 추론(진행 중 이슈의 현재 시점)이
동일한 조회 로직을 공유해야 train/serve skew가 생기지 않는다.

스키마 문서 기준 컬렉션 간 조인 키 표기가 일관되지 않는다
(events.issue는 이슈 key 예시, comments.issue는 이슈 _id 예시). 어떤 컬렉션이
key/_id/id 중 무엇을 쓰는지 문서만으로 확정할 수 없어, 이슈의 _id/id/key를
모두 후보로 넣어 $in 으로 조회해 누락을 방지한다.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo.database import Database

from ml_delay_risk.config import get_settings


def _issue_identifiers(issue: dict[str, Any]) -> list[Any]:
    candidates = [issue.get("_id"), issue.get("id"), issue.get("key")]
    seen: list[Any] = []
    for candidate in candidates:
        if candidate is not None and candidate not in seen:
            seen.append(candidate)
    return seen


def fetch_snapshot(
    db: Database, issue: dict[str, Any], cutoff: datetime
) -> tuple[list[dict], list[dict], list[dict]]:
    """issue와 연관된, cutoff 이전(<=)에 발생한 events/comments/worklogs를 모두 가져온다.

    여러 스냅샷 시점을 다뤄야 할 때는 이 함수를 '가장 늦은 cutoff' 한 번만 호출해
    전체 이력을 받아온 뒤, 더 이른 스냅샷들은 반환된 리스트를 메모리에서 다시
    필터링해서 재사용한다(Mongo 왕복 횟수를 스냅샷 개수만큼 늘리지 않기 위함).
    """
    settings = get_settings()
    identifiers = _issue_identifiers(issue)

    events = list(
        db[settings.events_collection].find(
            {"issue": {"$in": identifiers}, "created": {"$lte": cutoff}}
        )
    )
    comments = list(
        db[settings.comments_collection].find(
            {"issue": {"$in": identifiers}, "created": {"$lte": cutoff}}
        )
    )
    worklogs = list(
        db[settings.worklogs_collection].find(
            {
                "$or": [
                    {"issue": {"$in": identifiers}},
                    {"issueId": {"$in": identifiers}},
                ],
                "started": {"$lte": cutoff},
            }
        )
    )
    return events, comments, worklogs


def filter_before(records: list[dict], field: str, cutoff: datetime) -> list[dict]:
    """이미 받아온 레코드 목록을 더 이른 cutoff 기준으로 다시 자를 때 사용."""
    return [r for r in records if r.get(field) and r[field] <= cutoff]
