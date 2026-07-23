from __future__ import annotations

from collections.abc import Generator
from unittest.mock import Mock

import pytest

from core import cache
from core.config import Settings


@pytest.fixture(autouse=True)
def clear_redis_client_caches() -> Generator[None, None, None]:
    cache.get_redis_client.cache_clear()
    cache.get_async_redis_client.cache_clear()
    yield
    cache.get_redis_client.cache_clear()
    cache.get_async_redis_client.cache_clear()


def redis_settings() -> Settings:
    return Settings(
        database_url="postgresql://test",
        redis_url="redis://redis.internal:6380/2",
        redis_username="queue-user",
        redis_password="test-password",
    )


def test_get_redis_client_is_singleton_and_forwards_acl_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = object()
    from_url = Mock(return_value=client)
    monkeypatch.setattr(cache.Redis, "from_url", from_url)
    monkeypatch.setattr(cache, "get_settings", redis_settings)

    first = cache.get_redis_client()
    second = cache.get_redis_client()

    assert first is client
    assert second is first
    from_url.assert_called_once_with(
        "redis://redis.internal:6380/2",
        username="queue-user",
        password="test-password",
        decode_responses=True,
    )


def test_get_async_redis_client_is_singleton_and_forwards_acl_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = object()
    from_url = Mock(return_value=client)
    monkeypatch.setattr(cache.AsyncRedis, "from_url", from_url)
    monkeypatch.setattr(cache, "get_settings", redis_settings)

    first = cache.get_async_redis_client()
    second = cache.get_async_redis_client()

    assert first is client
    assert second is first
    from_url.assert_called_once_with(
        "redis://redis.internal:6380/2",
        username="queue-user",
        password="test-password",
        decode_responses=True,
    )


def test_cache_clear_rebuilds_clients(monkeypatch: pytest.MonkeyPatch) -> None:
    first_client = object()
    second_client = object()
    from_url = Mock(side_effect=(first_client, second_client))
    monkeypatch.setattr(cache.Redis, "from_url", from_url)
    monkeypatch.setattr(cache, "get_settings", redis_settings)

    first = cache.get_redis_client()
    cache.get_redis_client.cache_clear()
    second = cache.get_redis_client()

    assert first is first_client
    assert second is second_client
