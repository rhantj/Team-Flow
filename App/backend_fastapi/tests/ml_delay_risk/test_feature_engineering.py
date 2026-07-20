from __future__ import annotations

from datetime import datetime, timedelta

from ml_delay_risk.models.bot_filter import author_identifier, is_bot_author
from ml_delay_risk.models.feature_engineering import build_dynamic_features


def test_author_identifier_accepts_jira_author_dicts() -> None:
    assert author_identifier({"displayName": "Jane Developer", "accountId": "abc123"}) == "Jane Developer"
    assert author_identifier({"accountId": "abc123"}) == "abc123"
    assert is_bot_author({"displayName": "Jenkins Bot"}) is True
    assert is_bot_author({"displayName": "Jane Developer"}) is False


def test_build_dynamic_features_counts_dict_authors_without_hash_errors() -> None:
    created = datetime(2025, 1, 1, 9, 0, 0)
    cutoff = created + timedelta(days=2)

    features = build_dynamic_features(
        created=created,
        cutoff=cutoff,
        events=[],
        comments=[
            {"created": created + timedelta(hours=1), "author": {"displayName": "Jane Developer"}},
            {"created": created + timedelta(hours=2), "author": {"displayName": "Jane Developer"}},
            {"created": created + timedelta(hours=3), "author": {"name": "Kim Reviewer"}},
        ],
        worklogs=[
            {
                "started": created + timedelta(hours=4),
                "author": {"displayName": "Jane Developer"},
                "timeSpentSeconds": 1800,
            },
            {
                "started": created + timedelta(hours=5),
                "author": {"displayName": "Jenkins Bot"},
                "timeSpentSeconds": 7200,
            },
        ],
        original_estimate_seconds=3600,
        proxy_deadline_hours=72,
        current_assignee="Jane Developer",
        is_bot_author=is_bot_author,
        recent_activity_window_days=3,
    )

    assert features["num_unique_commenters"] == 2
    assert features["num_worklog_entries"] == 1
    assert features["num_unique_workers"] == 1
    assert features["time_spent_seconds_before_cutoff"] == 1800
