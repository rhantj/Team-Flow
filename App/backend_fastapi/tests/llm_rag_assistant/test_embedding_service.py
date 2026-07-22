from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from core.config import get_settings
from llm_rag_assistant.app.services.embedding_service import _get_model, embed_text, preload_embedding_model
from llm_rag_assistant.app.services.vector_utils import to_vector_literal


def test_to_vector_literal_formats_floats_as_pgvector_literal() -> None:
    assert to_vector_literal([0.1, 0.2, 0.3]) == "[0.10000000,0.20000000,0.30000000]"


@pytest.mark.asyncio
async def test_embed_text_loads_configured_model_and_encodes_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_EMBEDDING_MODEL", "rhantj/bge-m3-workflow-query-robust")
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")
    get_settings.cache_clear()
    _get_model.cache_clear()

    mock_encoded = MagicMock()
    mock_encoded.tolist.return_value = [0.1, 0.2, 0.3]
    mock_model = MagicMock()
    mock_model.encode.return_value = mock_encoded

    try:
        with patch(
            "llm_rag_assistant.app.services.embedding_service.SentenceTransformer",
            return_value=mock_model,
        ) as mock_cls:
            result = await embed_text("회의록 요약 텍스트")

        assert result == pytest.approx([0.1, 0.2, 0.3])
        mock_cls.assert_called_once_with("rhantj/bge-m3-workflow-query-robust", token="hf_test_token")
        mock_model.encode.assert_called_once_with("회의록 요약 텍스트")
    finally:
        get_settings.cache_clear()
        _get_model.cache_clear()


@pytest.mark.asyncio
async def test_embed_text_uses_anonymous_access_when_hf_token_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """hf_token이 없을 때 token=None을 그대로 넘기면 huggingface_hub가 로컬에 캐시된(만료됐을 수도
    있는) 로그인 토큰을 암묵적으로 사용해 공개 저장소 접근도 401로 실패할 수 있다. 반드시
    token=False로 명시적 익명 접근을 강제해야 한다."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_EMBEDDING_MODEL", "rhantj/bge-m3-workflow-query-robust")
    monkeypatch.delenv("HF_TOKEN", raising=False)
    get_settings.cache_clear()
    _get_model.cache_clear()

    mock_model = MagicMock()

    try:
        with patch(
            "llm_rag_assistant.app.services.embedding_service.SentenceTransformer",
            return_value=mock_model,
        ) as mock_cls:
            await preload_embedding_model()

        mock_cls.assert_called_once_with("rhantj/bge-m3-workflow-query-robust", token=False)
    finally:
        get_settings.cache_clear()
        _get_model.cache_clear()
