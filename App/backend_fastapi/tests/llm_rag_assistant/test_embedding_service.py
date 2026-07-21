from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from core.config import get_settings
from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.vector_utils import to_vector_literal


def test_to_vector_literal_formats_floats_as_pgvector_literal() -> None:
    assert to_vector_literal([0.1, 0.2, 0.3]) == "[0.10000000,0.20000000,0.30000000]"


@pytest.mark.asyncio
async def test_embed_text_calls_huggingface_endpoint_embeddings_with_configured_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_embeddings = MagicMock()
    mock_embeddings.aembed_query = AsyncMock(return_value=[0.1, 0.2, 0.3])

    with patch(
        "llm_rag_assistant.app.services.embedding_service.HuggingFaceEndpointEmbeddings",
        return_value=mock_embeddings,
    ) as mock_cls:
        result = await embed_text("회의록 요약 텍스트")

    assert result == pytest.approx([0.1, 0.2, 0.3])
    mock_cls.assert_called_once_with(model="BAAI/bge-m3", huggingfacehub_api_token="hf_test_token")
    mock_embeddings.aembed_query.assert_awaited_once_with("회의록 요약 텍스트")


@pytest.mark.asyncio
async def test_embed_text_raises_when_hf_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.delenv("HF_TOKEN", raising=False)
    get_settings.cache_clear()

    try:
        with pytest.raises(RuntimeError, match="HF_TOKEN"):
            await embed_text("텍스트")
    finally:
        get_settings.cache_clear()
