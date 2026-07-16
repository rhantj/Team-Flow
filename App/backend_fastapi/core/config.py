from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    ollama_host: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    generation_model: str = "gemma4:e2b"


@lru_cache
def get_settings() -> Settings:
    return Settings()
