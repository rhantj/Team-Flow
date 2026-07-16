from __future__ import annotations

from typing import AsyncIterator

import asyncpg

from core.config import get_settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> AsyncIterator[asyncpg.Pool]:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = await asyncpg.create_pool(
            dsn=settings.database_url, min_size=1, max_size=5, statement_cache_size=0
        )
    yield _pool
