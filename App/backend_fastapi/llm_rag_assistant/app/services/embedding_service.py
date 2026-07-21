from __future__ import annotations

import asyncio

from huggingface_hub import InferenceClient

from core.config import get_settings


async def embed_text(text: str) -> list[float]:
    settings = get_settings()

    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not configured.")

    client = InferenceClient(token=settings.hf_token)
    vector = await asyncio.to_thread(
        client.feature_extraction, text, model=settings.hf_embedding_model
    )
    if vector.ndim == 2:
        vector = vector.mean(axis=0)
    return vector.tolist()
