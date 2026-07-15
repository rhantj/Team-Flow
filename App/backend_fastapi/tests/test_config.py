from __future__ import annotations

import pytest
from pydantic import ValidationError


def test_settings_requires_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from core.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_settings_loads_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@localhost:5432/workflow")
    from core.config import Settings

    settings = Settings(_env_file=None)
    assert settings.database_url == "postgresql://user:pw@localhost:5432/workflow"
    assert settings.embedding_model == "nomic-embed-text"
    assert settings.generation_model == "gemma2"
