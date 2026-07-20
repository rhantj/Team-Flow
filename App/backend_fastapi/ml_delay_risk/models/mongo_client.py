"""MongoDB(ml_dashboard) 연결 및 인덱스 관리."""
from __future__ import annotations

import logging
from functools import lru_cache

from pymongo import ASCENDING, MongoClient
from pymongo.database import Database

from ml_delay_risk.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache
def get_client() -> MongoClient:
    settings = get_settings()
    return MongoClient(settings.mongo_uri)


def get_database() -> Database:
    settings = get_settings()
    return get_client()[settings.mongo_db]


def ensure_indexes() -> None:
    """events/comments/worklogs에 issue(issueId) 단일 인덱스가 없으면 생성.

    스키마 문서 기준 이 세 컬렉션(약 978만/511만/64만 건)은 _id 인덱스만 존재해,
    issue 기준 조회 시 풀 스캔이 발생한다. 학습 데이터 구축 전에 1회 보장한다.
    """
    settings = get_settings()
    db = get_database()
    db[settings.events_collection].create_index([("issue", ASCENDING)], background=True)
    db[settings.comments_collection].create_index([("issue", ASCENDING)], background=True)
    db[settings.worklogs_collection].create_index([("issue", ASCENDING)], background=True)
    db[settings.worklogs_collection].create_index([("issueId", ASCENDING)], background=True)
    logger.info("MongoDB 인덱스 확인/생성 완료 (events.issue, comments.issue, worklogs.issue/issueId)")
