from __future__ import annotations

from langchain_huggingface import HuggingFaceEndpointEmbeddings

from core.config import get_settings


async def embed_text(text: str) -> list[float]:
    settings = get_settings()

    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not configured.")

    embeddings = HuggingFaceEndpointEmbeddings(
        model=settings.hf_embedding_model, huggingfacehub_api_token=settings.hf_token
    )
    return await embeddings.aembed_query(text)
