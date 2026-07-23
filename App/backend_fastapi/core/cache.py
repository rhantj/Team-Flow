from __future__ import annotations

from functools import lru_cache

from redis import Redis
from redis.asyncio import Redis as AsyncRedis

from core.config import get_settings

REDIS_SOCKET_TIMEOUT_SECONDS = 2.0


@lru_cache
def get_redis_client() -> Redis:
    settings = get_settings()
    return Redis.from_url(
        settings.redis_url,
        username=settings.redis_username,
        password=settings.redis_password,
        decode_responses=True,
        socket_connect_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        retry_on_timeout=False,
    )


@lru_cache
def get_async_redis_client() -> AsyncRedis:
    settings = get_settings()
    return AsyncRedis.from_url(
        settings.redis_url,
        username=settings.redis_username,
        password=settings.redis_password,
        decode_responses=True,
        socket_connect_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
        retry_on_timeout=False,
    )


async def advance_rag_project_epoch(project_id: int) -> None:
    await get_async_redis_client().incr(f"rag_epoch:{project_id}")
