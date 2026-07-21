from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    ollama_host: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    generation_model: str = "gemma4:e2b"

    hf_token: str | None = None
    hf_embedding_model: str = "BAAI/bge-m3"
    hf_rag_generation_model: str = Field(
        default="Qwen/Qwen3-4B-Instruct-2507",
        validation_alias="HF_MEETING_ANALYSIS_MODEL",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
