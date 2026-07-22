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


def parse_checklist_response(raw: str) -> List[ChecklistItemSuggestion]:
    data = json.loads(_strip_code_fence(raw))
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
        items.append(ChecklistItemSuggestion(title=title[:MAX_TITLE_LEN], reason=str(item.get("reason", "")).strip()))
    if not items:
        raise ValueError("유효한 체크리스트 항목이 없습니다.")
    return items[:MAX_ITEMS]


import logging
import os

import ollama

logger = logging.getLogger(__name__)

DEFAULT_CHECKLIST_MODEL = "qwen2.5:1.5b"
DEFAULT_CHECKLIST_TIMEOUT_SECONDS = 20.0
DEFAULT_CHECKLIST_NUM_PREDICT = 400


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


def generate_checklist(request: ChecklistGenerateRequest) -> ChecklistGenerateResponse:
    provider = os.getenv("CHECKLIST_PROVIDER", "ollama").lower()
    if provider != "ollama":
        raise RuntimeError(f"지원하지 않는 CHECKLIST_PROVIDER: {provider}")
    # Ollama 실패 시 예외를 전파한다. 규칙 기반 폴백은 Spring의 RuleBasedChecklistGenerator가
    # 카테고리별 풍부한 템플릿으로 담당하므로, FastAPI는 자체 폴백을 하지 않고 실패를 알린다.
    return generate_checklist_with_ollama(request)
