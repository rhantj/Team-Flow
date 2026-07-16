from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.vector_utils import to_vector_literal


def test_to_vector_literal_formats_floats_as_pgvector_literal() -> None:
    assert to_vector_literal([0.1, 0.2, 0.3]) == "[0.10000000,0.20000000,0.30000000]"


@pytest.mark.asyncio
async def test_embed_text_calls_ollama_with_configured_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    fake_response = {"embedding": [0.1, 0.2, 0.3]}
    mock_client = AsyncMock()
    mock_client.embeddings.return_value = fake_response

    with patch("llm_rag_assistant.app.services.embedding_service.AsyncClient", return_value=mock_client):
        result = await embed_text("회의록 요약 텍스트")

    assert result == [0.1, 0.2, 0.3]
    mock_client.embeddings.assert_awaited_once_with(model="nomic-embed-text", prompt="회의록 요약 텍스트")
