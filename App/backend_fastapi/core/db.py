from __future__ import annotations

import json
from typing import AsyncIterator

import asyncpg

from core.config import get_settings

_pool: asyncpg.Pool | None = None


async def _register_jsonb_codec(conn: asyncpg.Connection) -> None:
    # asyncpg는 jsonb/json 컬럼을 기본적으로 원본 JSON 텍스트(str)로 반환한다.
    # 코덱을 등록하지 않으면 List[str] 컬럼(meeting_analysis.decisions 등)이
    # 문자열로 와서 ", ".join(...)이 문자 단위로 쪼개지는 버그가 생긴다.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )
    await conn.set_type_codec(
        "json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )


async def create_pool() -> asyncpg.Pool:
    settings = get_settings()
    return await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=1,
        max_size=5,
        statement_cache_size=0,
        init=_register_jsonb_codec,
    )


async def get_pool() -> AsyncIterator[asyncpg.Pool]:
    global _pool
    if _pool is None:
        _pool = await create_pool()
    yield _pool
