from __future__ import annotations

from ollama import AsyncClient

from core.config import get_settings


async def embed_text(text: str) -> list[float]:
    settings = get_settings()
    client = AsyncClient(host=settings.ollama_host)
    response = await client.embeddings(model=settings.embedding_model, prompt=text)
    return response["embedding"]
