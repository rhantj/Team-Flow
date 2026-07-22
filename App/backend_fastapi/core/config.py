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
    hf_embedding_model: str = "rhantj/bge-m3-workflow-query-robust"
    # 원격 저장소에 새 커밋이 올라가도 배포된 서버가 다른 가중치를 조용히 받아쓰지 않도록 고정.
    # 모델을 갱신할 때는 이 값도 새 커밋 SHA로 함께 바꿔야 한다.
    hf_embedding_model_revision: str = "dc328732ab2c3330d38305199e26b2d060586af3"
    hf_rag_generation_model: str = Field(
        default="Qwen/Qwen3-4B-Instruct-2507",
        validation_alias="HF_MEETING_ANALYSIS_MODEL",
    )

    # Spring(RagController)만 RAG 라우터를 호출할 수 있도록 검증하는 서비스 간 공유 시크릿.
    # 미설정 시 llm_rag_assistant/app/security.py가 모든 요청을 거부한다(fail-closed).
    rag_internal_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
