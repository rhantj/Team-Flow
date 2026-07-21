from __future__ import annotations

import pytest

from core.config import Settings


def test_settings_defaults_hf_embedding_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.delenv("HF_EMBEDDING_MODEL", raising=False)

    settings = Settings()

    assert settings.hf_embedding_model == "BAAI/bge-m3"


def test_settings_defaults_hf_rag_generation_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.delenv("HF_MEETING_ANALYSIS_MODEL", raising=False)

    settings = Settings()

    assert settings.hf_rag_generation_model == "Qwen/Qwen3-4B-Instruct-2507"


def test_settings_reads_hf_rag_generation_model_from_meeting_analysis_env_var(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_MEETING_ANALYSIS_MODEL", "some-org/some-model")

    settings = Settings()

    assert settings.hf_rag_generation_model == "some-org/some-model"


def test_settings_reads_hf_token_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    monkeypatch.setenv("HF_TOKEN", "hf_abc123")

    settings = Settings()

    assert settings.hf_token == "hf_abc123"
