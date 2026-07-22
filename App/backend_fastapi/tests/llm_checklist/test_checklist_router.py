from __future__ import annotations

from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from llm_checklist.app.checklist_schema import ChecklistGenerateResponse, ChecklistItemSuggestion
from llm_checklist.app.routers.checklist_router import router

app = FastAPI()
app.include_router(router)
client = TestClient(app, raise_server_exceptions=False)


def test_generate_returns_500_when_ollama_fails():
    with patch("llm_checklist.app.checklist_pipeline.generate_checklist_with_ollama",
               side_effect=RuntimeError("ollama down")):
        res = client.post("/ai/checklist/generate", json={"title": "로그인 API", "category": "backend"})
    assert res.status_code == 500


def test_generate_uses_ollama_when_available():
    fake = ChecklistGenerateResponse(items=[ChecklistItemSuggestion(title="API 설계", reason="x")], engine="ollama")
    with patch("llm_checklist.app.checklist_pipeline.generate_checklist_with_ollama", return_value=fake):
        res = client.post("/ai/checklist/generate", json={"title": "로그인 API", "category": "backend"})
    body = res.json()
    assert body["engine"] == "ollama"
    assert body["items"][0]["title"] == "API 설계"
