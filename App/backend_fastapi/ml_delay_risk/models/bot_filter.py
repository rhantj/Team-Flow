"""worklogs의 봇(Bot) 계정 필터링.

'핵심 피쳐' 가이드: GitHub 봇 등이 자동으로 남긴 worklog를 사람의 작업량으로
잘못 학습하면 '실제 활동 모멘텀' 피처가 왜곡되므로 반드시 예외 처리해야 한다.
"""
from __future__ import annotations

from typing import Optional

BOT_NAME_MARKERS = (
    "bot",
    "[bot]",
    "hudson",
    "jenkins",
    "buildbot",
    "github-actions",
)


def is_bot_author(author_name: Optional[str]) -> bool:
    if not author_name:
        return False
    lowered = author_name.lower()
    return any(marker in lowered for marker in BOT_NAME_MARKERS)
