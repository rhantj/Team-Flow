from __future__ import annotations

import asyncio
from functools import lru_cache

from sentence_transformers import SentenceTransformer

from core.config import get_settings


@lru_cache
def _get_model() -> SentenceTransformer:
    settings = get_settings()
    # token=None은 huggingface_hub가 로컬에 캐시된 로그인 토큰을 암묵적으로 사용하게 만든다
    # (만료/무효 토큰이 있으면 공개 저장소도 401로 실패함). hf_token 미설정 시 명시적으로
    # 토큰 없이 익명 접근하도록 False를 넘긴다.
    return SentenceTransformer(settings.hf_embedding_model, token=settings.hf_token or False)


def _encode(text: str) -> list[float]:
    return _get_model().encode(text).tolist()


async def embed_text(text: str) -> list[float]:
    return await asyncio.to_thread(_encode, text)


async def preload_embedding_model() -> None:
    """앱 기동 시 모델을 미리 로드해 첫 RAG 요청이 모델 다운로드/로딩 지연을 떠안지 않게 한다."""
    await asyncio.to_thread(_get_model)
