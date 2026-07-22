from __future__ import annotations

import json
import re
from typing import List

from .checklist_schema import (
    ChecklistGenerateRequest,
    ChecklistGenerateResponse,
    ChecklistItemSuggestion,
)

MAX_ITEMS = 10
MAX_TITLE_LEN = 60


def _strip_code_fence(raw: str) -> str:
    trimmed = raw.strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```[a-zA-Z]*\n?", "", trimmed)
        trimmed = re.sub(r"```\s*$", "", trimmed)
    return trimmed.strip()


def build_checklist_prompt(request: ChecklistGenerateRequest) -> str:
    existing = ", ".join(request.existing_items) if request.existing_items else "(없음)"
    return f"""다음 업무를 완료하기 위한 체크리스트 항목을 만드세요. 아래 JSON 스키마로만 응답하고, 스키마 밖의 텍스트는 출력하지 마세요.

업무 제목: {request.title}
업무 설명: {request.description or "(없음)"}
카테고리: {request.category or "(미지정)"}
우선순위: {request.priority or "(미지정)"}
마감일: {request.due_date or "(미지정)"}
이미 존재하는 체크리스트 항목(중복 금지): {existing}

JSON 스키마:
{{
  "items": [
    {{ "title": "5~15자 명사형 체크 항목", "reason": "이 항목이 필요한 짧은 근거" }}
  ]
}}

규칙 - 반드시 지킬 것:
1. items는 3~7개.
2. title은 실행 가능한 단계로, 5~15자 명사형(예: "API 설계", "단위 테스트 작성").
3. 이미 존재하는 항목과 의미가 겹치는 항목은 만들지 않는다.
4. 업무 제목·설명과 무관한 일반론은 넣지 않는다.
"""


MAX_REASON_LEN = 300


def parse_checklist_response(raw: str) -> List[ChecklistItemSuggestion]:
    data = json.loads(_strip_code_fence(raw))
    if not isinstance(data, dict):
        # LLM이 객체가 아닌 배열/스칼라를 반환한 경우도 명시적 ValueError로 처리(AttributeError 방지).
        raise ValueError("체크리스트 응답이 JSON 객체가 아닙니다.")
    items_raw = data.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        raise ValueError("체크리스트 items가 비어 있거나 리스트가 아닙니다.")
    items: List[ChecklistItemSuggestion] = []
    for item in items_raw:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()
        if not title:
            continue
        reason = str(item.get("reason", "")).strip()
        items.append(ChecklistItemSuggestion(title=title[:MAX_TITLE_LEN], reason=reason[:MAX_REASON_LEN]))
    if not items:
        raise ValueError("유효한 체크리스트 항목이 없습니다.")
    return items[:MAX_ITEMS]


import logging
import os

import httpx
import ollama

logger = logging.getLogger(__name__)

DEFAULT_CHECKLIST_MODEL = "qwen2.5:1.5b"
DEFAULT_CHECKLIST_TIMEOUT_SECONDS = 20.0
DEFAULT_CHECKLIST_NUM_PREDICT = 400

# HuggingFace Inference API(회의록 분석과 동일한 프로바이더) 기본값.
HF_CHAT_COMPLETIONS_URL = "https://router.huggingface.co/v1/chat/completions"
DEFAULT_CHECKLIST_HF_MODEL = "Qwen/Qwen3-4B-Instruct-2507"
DEFAULT_CHECKLIST_HF_TIMEOUT_SECONDS = 35.0
DEFAULT_CHECKLIST_HF_MAX_TOKENS = 700


def generate_checklist_with_ollama(request: ChecklistGenerateRequest) -> ChecklistGenerateResponse:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = os.getenv("CHECKLIST_MODEL", DEFAULT_CHECKLIST_MODEL)
    timeout_seconds = float(os.getenv("CHECKLIST_TIMEOUT_SECONDS", str(DEFAULT_CHECKLIST_TIMEOUT_SECONDS)))
    temperature = float(os.getenv("CHECKLIST_TEMPERATURE", "0.2"))
    num_predict = int(os.getenv("CHECKLIST_NUM_PREDICT", str(DEFAULT_CHECKLIST_NUM_PREDICT)))

    client = ollama.Client(host=host, timeout=timeout_seconds)
    response = client.chat(
        model=model,
        messages=[{"role": "user", "content": build_checklist_prompt(request)}],
        format="json",
        options={"temperature": temperature, "num_ctx": 4096, "num_predict": num_predict},
        keep_alive=os.getenv("CHECKLIST_KEEP_ALIVE", "5m"),
    )
    items = parse_checklist_response(response["message"]["content"])
    logger.info("Ollama 체크리스트 생성 성공. model=%s, items=%d", model, len(items))
    return ChecklistGenerateResponse(items=items, engine="ollama")


def generate_checklist_with_huggingface(request: ChecklistGenerateRequest) -> ChecklistGenerateResponse:
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN is not configured.")

    endpoint = os.getenv("CHECKLIST_HF_ENDPOINT", HF_CHAT_COMPLETIONS_URL)
    model = os.getenv("CHECKLIST_HF_MODEL") or os.getenv("HF_MEETING_ANALYSIS_MODEL", DEFAULT_CHECKLIST_HF_MODEL)
    timeout_seconds = float(os.getenv("CHECKLIST_HF_TIMEOUT_SECONDS", str(DEFAULT_CHECKLIST_HF_TIMEOUT_SECONDS)))
    max_tokens = int(os.getenv("CHECKLIST_HF_MAX_TOKENS", str(DEFAULT_CHECKLIST_HF_MAX_TOKENS)))
    temperature = float(os.getenv("CHECKLIST_HF_TEMPERATURE", "0.2"))

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": build_checklist_prompt(request)}],
        "stream": False,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(endpoint, headers=headers, json=payload)
        response.raise_for_status()
        body = response.json()

    items = parse_checklist_response(body["choices"][0]["message"]["content"])
    logger.info("Hugging Face 체크리스트 생성 성공. model=%s, items=%d", model, len(items))
    return ChecklistGenerateResponse(items=items, engine="huggingface")


def generate_checklist(request: ChecklistGenerateRequest) -> ChecklistGenerateResponse:
    # 앱 전역 LLM 프로바이더를 따른다: CHECKLIST_PROVIDER > MEETING_ANALYSIS_PROVIDER > "ollama".
    # (팀 환경은 MEETING_ANALYSIS_PROVIDER=huggingface 로 HF Inference API를 쓴다.)
    provider = (os.getenv("CHECKLIST_PROVIDER") or os.getenv("MEETING_ANALYSIS_PROVIDER", "ollama")).lower()
    # 실패 시 예외를 전파한다. 규칙 기반 폴백은 Spring의 RuleBasedChecklistGenerator가
    # 카테고리별 풍부한 템플릿으로 담당하므로, FastAPI는 자체 폴백을 하지 않고 실패를 알린다.
    if provider in {"huggingface", "hf"}:
        return generate_checklist_with_huggingface(request)
    if provider == "ollama":
        return generate_checklist_with_ollama(request)
    raise RuntimeError(f"지원하지 않는 LLM 프로바이더: {provider}")
