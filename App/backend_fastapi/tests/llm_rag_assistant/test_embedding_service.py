from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from llm_rag_assistant.app.services.embedding_service import embed_text
from llm_rag_assistant.app.services.vector_utils import to_vector_literal


def test_to_vector_literal_formats_floats_as_pgvector_literal() -> None:
    assert to_vector_literal([0.1, 0.2, 0.3]) == "[0.10000000,0.20000000,0.30000000]"


@pytest.mark.asyncio
async def test_embed_text_calls_huggingface_with_configured_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_client = MagicMock()
    mock_client.feature_extraction.return_value = np.array([0.1, 0.2, 0.3])

    with patch(
        "llm_rag_assistant.app.services.embedding_service.InferenceClient", return_value=mock_client
    ):
        result = await embed_text("회의록 요약 텍스트")

    assert result == pytest.approx([0.1, 0.2, 0.3])
    mock_client.feature_extraction.assert_called_once_with("회의록 요약 텍스트", model="BAAI/bge-m3")


@pytest.mark.asyncio
async def test_embed_text_mean_pools_token_level_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    mock_client = MagicMock()
    mock_client.feature_extraction.return_value = np.array([[0.0, 1.0], [2.0, 3.0]])

    with patch(
        "llm_rag_assistant.app.services.embedding_service.InferenceClient", return_value=mock_client
    ):
        result = await embed_text("긴 텍스트")

    assert result == pytest.approx([1.0, 2.0])
