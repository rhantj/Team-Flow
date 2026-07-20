"""worklogs의 봇(Bot) 계정 필터링.

'핵심 피쳐' 가이드: GitHub 봇 등이 자동으로 남긴 worklog를 사람의 작업량으로
잘못 학습하면 '실제 활동 모멘텀' 피처가 왜곡되므로 반드시 예외 처리해야 한다.
"""
from __future__ import annotations

from typing import Any, Optional

BOT_NAME_MARKERS = (
    "bot",
    "[bot]",
    "hudson",
    "jenkins",
    "buildbot",
    "github-actions",
)


def author_identifier(author: Any) -> Optional[str]:
    """Jira author 값이 문자열/딕셔너리 어느 쪽이어도 비교 가능한 문자열로 정규화."""
    if not author:
        return None
    if isinstance(author, str):
        normalized = author.strip()
        return normalized or None
    if isinstance(author, dict):
        for key in (
            "displayName",
            "display_name",
            "name",
            "key",
            "accountId",
            "account_id",
            "emailAddress",
            "email",
            "username",
        ):
            value = author.get(key)
            if value:
                normalized = str(value).strip()
                if normalized:
                    return normalized
        text_values = [str(value).strip() for value in author.values() if value and not isinstance(value, dict)]
        normalized = " ".join(value for value in text_values if value)
        return normalized or None
    normalized = str(author).strip()
    return normalized or None


def is_bot_author(author_name: Any) -> bool:
    author_name = author_identifier(author_name)
    if not author_name:
        return False
    lowered = author_name.lower()
    return any(marker in lowered for marker in BOT_NAME_MARKERS)
