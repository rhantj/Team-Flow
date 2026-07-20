from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, timedelta
from typing import List, Optional

import ollama
from fastapi import FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llm_rag_assistant.app.routers.chat_router import router as rag_router
from ml_workload_score.app.routers.workload_router import router as workload_router
from ai_contribution_report.app.routers.contribution_router import router as contribution_router
from ml_delay_risk.routers.delay_router import router as delay_risk_router
from ml_delay_risk.routers.task_delay_router import router as task_delay_risk_router

logger = logging.getLogger(__name__)

app = FastAPI(title="WorkFlow AI FastAPI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag_router)
app.include_router(workload_router)
app.include_router(contribution_router)
app.include_router(delay_risk_router)
app.include_router(task_delay_risk_router)


@app.get("/")
def root():
    return {
        "service": "WorkFlow AI FastAPI",
        "status": "UP",
        "health": "/api/v1/health",
        "docs": "/docs",
        "web": "http://localhost:5173",
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


class AnalyzeRequest(BaseModel):
    project_id: str = "demo-project"
    title: str = "회의록 AI 분석 회의"
    meeting_date: str = Field(default_factory=lambda: date.today().isoformat())
    meeting_kind: str = "정기회의"
    source_type: str = "document"
    file_name: Optional[str] = None
    text: str = ""
    participants: List[str] = Field(default_factory=list)


class MeetingTodo(BaseModel):
    title: str
    description: str
    assignee_candidate: str
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: str
    category: str
    needs_leader_review: bool = True


class MeetingMeta(BaseModel):
    title: str
    meeting_date: str
    participants: List[str]


class MeetingAnalysisResult(BaseModel):
    summary: str
    decisions: List[str]
    todos: List[MeetingTodo]
    risks: List[str]
    keywords: List[str]
    meeting_meta: MeetingMeta


@app.get("/api/v1/health")
def health():
    return {"service": "workflow-ai-fastapi", "status": "UP"}


@app.post("/api/v1/meetings/analyze-json", response_model=MeetingAnalysisResult)
def analyze_json(request: AnalyzeRequest):
    provider = os.getenv("MEETING_ANALYSIS_PROVIDER", "ollama")
    if provider == "ollama":
        try:
            return analyze_meeting_with_ollama(request)
        except Exception:
            # Ollama 미실행/모델 없음/timeout/JSON 파싱 실패/Pydantic 검증 실패 등
            # 원인이 다양하지만 전부 동일하게 규칙 기반 분석으로 대체해야 하므로 광범위하게 잡는다.
            logger.exception("Ollama 회의록 분석 실패, 규칙 기반 분석으로 대체합니다.")
    return analyze_meeting(request)


@app.post("/api/v1/meetings/analyze", response_model=MeetingAnalysisResult)
async def analyze_upload(
    file: Optional[UploadFile] = File(default=None),
    title: str = Form(default="회의록 AI 분석 회의"),
    meeting_date: Optional[str] = Form(default=None),
    meeting_kind: str = Form(default="정기회의"),
    source_type: str = Form(default="document"),
    participants: List[str] = Form(default=[]),
):
    text = ""
    file_name = None
    if file:
        file_name = file.filename
        raw = await file.read()
        text = raw.decode("utf-8", errors="ignore")
    return analyze_meeting(
        AnalyzeRequest(
            title=title,
            meeting_date=meeting_date or date.today().isoformat(),
            meeting_kind=meeting_kind,
            source_type=source_type,
            file_name=file_name,
            text=text,
            participants=participants,
        )
    )


def resolve_participants(request: AnalyzeRequest) -> List[str]:
    participants = [p for p in request.participants if p and p.strip()]
    if not participants:
        participants = ["팀장", "팀원"]
    return participants


def analyze_meeting(request: AnalyzeRequest) -> MeetingAnalysisResult:
    raw_text = request.text or request.title
    text = normalize_text(raw_text)
    participants = resolve_participants(request)

    decisions = extract_sentences(text, ["확정", "결정", "통일", "진행", "사용", "구성"], 5)
    if not decisions:
        decisions = [
            "회의록 분석 결과를 요약, 결정사항, To-Do, 위험요소로 구조화한다.",
            "생성된 To-Do는 팀장 검토 후 업무 보드에 등록한다.",
        ]

    risks = extract_sentences(text, ["위험", "지연", "부족", "오류", "실패", "불안정", "촉박"], 4)
    if not risks:
        risks = ["담당자와 마감일이 명확하지 않은 업무는 일정 지연으로 이어질 수 있다."]

    # 원본 텍스트(줄바꿈 보존)에서 "이름: 발언" 화자 형식을 먼저 시도하고, 없으면 공백-정규화 텍스트의
    # 키워드 문장 추출로 대체한다. normalize_text()는 줄바꿈을 공백으로 뭉개므로 화자 구분에 쓸 수 없다.
    todos = build_todos(raw_text, text, request.meeting_date)
    summary = (
        f"{request.title} 내용을 분석해 핵심 결정사항 {len(decisions)}건, "
        f"업무 후보 {len(todos)}건, 위험요소 {len(risks)}건을 추출했습니다."
    )

    return MeetingAnalysisResult(
        summary=summary,
        decisions=decisions,
        todos=todos,
        risks=risks,
        keywords=build_keywords(text, request.source_type),
        meeting_meta=MeetingMeta(
            title=request.title,
            meeting_date=request.meeting_date,
            participants=participants,
        ),
    )


_VALID_PRIORITIES = {"HIGH", "MEDIUM", "LOW"}
_VALID_CATEGORIES = {
    "FRONTEND",
    "BACKEND",
    "AI",
    "DATABASE",
    "QA",
    "DOCUMENT",
    "PRESENTATION",
    "ETC",
}


def analyze_meeting_with_ollama(request: AnalyzeRequest) -> MeetingAnalysisResult:
    host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    model = os.getenv("MEETING_ANALYSIS_MODEL", "gemma4:e2b")
    timeout_seconds = float(os.getenv("MEETING_ANALYSIS_TIMEOUT_SECONDS", "45"))
    temperature = float(os.getenv("OLLAMA_ANALYSIS_TEMPERATURE", "0.1"))

    client = ollama.Client(host=host, timeout=timeout_seconds)
    response = client.chat(
        model=model,
        messages=[{"role": "user", "content": build_ollama_prompt(request)}],
        format="json",
        options={"temperature": temperature},
    )
    raw = response["message"]["content"]
    return parse_ollama_analysis_response(raw, request)


def build_ollama_prompt(request: AnalyzeRequest) -> str:
    participants = ", ".join(resolve_participants(request))
    text = request.text or request.title
    return f"""다음은 회의록 원문입니다. 이 내용을 분석해서 아래 JSON 스키마로만 응답하세요. 스키마에 없는 다른 텍스트는 출력하지 마세요.

회의 제목: {request.title}
회의 일자: {request.meeting_date}
선택된 참석자: {participants}

회의록 원문:
{text}

JSON 스키마:
{{
  "summary": "회의 내용 한두 문장 요약",
  "decisions": ["결정사항 문장", "..."],
  "todos": [
    {{
      "title": "업무 제목(간단히)",
      "description": "업무 상세 설명",
      "assignee_candidate": "담당자 이름 또는 빈 문자열",
      "due_date": "YYYY-MM-DD 또는 null",
      "priority": "HIGH 또는 MEDIUM 또는 LOW",
      "category": "FRONTEND 또는 BACKEND 또는 AI 또는 DATABASE 또는 QA 또는 DOCUMENT 또는 PRESENTATION 또는 ETC"
    }}
  ],
  "risks": ["위험요소 문장", "..."],
  "keywords": ["키워드", "..."]
}}

담당자(assignee_candidate) 규칙 - 반드시 지킬 것:
1. 회의록 내용에서 특정 인물이 명시적으로 담당한다고 말한 업무만 그 사람 이름을 assignee_candidate로 적는다.
   예: "제가 하겠습니다", "저는 OO를 맡겠습니다" -> 발언자 본인. "OO가 맡겠습니다", "OO가 구현합니다", "담당: OO" -> 명시된 OO.
2. 위와 같이 명시적으로 담당을 밝힌 경우가 아니면 assignee_candidate는 반드시 빈 문자열("")로 남긴다.
3. 선택된 참석자 목록에 있다는 이유만으로 아무에게나 업무를 임의 배정하지 않는다.
4. 회의록에 실제로 등장하지 않는 이름을 만들어내지 않는다.
5. 특정 인물이나 목록의 첫 번째 참석자에게 fallback으로 몰아서 배정하지 않는다. 한 사람에게 모든 업무를 배정하는 것은 금지된다.
"""


def _strip_code_fence(raw: str) -> str:
    trimmed = raw.strip()
    if trimmed.startswith("```"):
        trimmed = re.sub(r"^```[a-zA-Z]*\n?", "", trimmed)
        trimmed = re.sub(r"```\s*$", "", trimmed)
    return trimmed.strip()


def _sanitize_assignee_candidate(candidate: str, source_text: str) -> str:
    """모델이 회의록에 등장하지 않는 이름을 지어내는 것을 막는 안전장치.
    회의록 원문에 실제로 등장하지 않는 이름은 미배정(빈 문자열)으로 되돌린다."""
    name = candidate.strip()
    if not name or name not in source_text:
        return ""
    return name


def parse_ollama_analysis_response(raw: str, request: AnalyzeRequest) -> MeetingAnalysisResult:
    payload = json.loads(_strip_code_fence(raw))
    if not isinstance(payload, dict):
        raise ValueError("Ollama 응답이 JSON 객체가 아닙니다.")

    summary = str(payload.get("summary") or "").strip()
    if not summary:
        raise ValueError("Ollama 응답에 summary가 없습니다.")

    source_text = request.text or request.title
    todos: List[MeetingTodo] = []
    for item in payload.get("todos") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        description = str(item.get("description") or "").strip()
        if not title and not description:
            continue

        priority = str(item.get("priority") or "MEDIUM").upper()
        if priority not in _VALID_PRIORITIES:
            priority = "MEDIUM"
        category = str(item.get("category") or "ETC").upper()
        if category not in _VALID_CATEGORIES:
            category = "ETC"
        due_date = item.get("due_date")
        due_date = due_date if isinstance(due_date, str) and due_date.strip() else None
        assignee_candidate = _sanitize_assignee_candidate(str(item.get("assignee_candidate") or ""), source_text)

        todos.append(
            MeetingTodo(
                title=shorten(title or description, 44),
                description=description or title,
                assignee_candidate=assignee_candidate,
                assignee_id=None,
                due_date=due_date,
                priority=priority,
                category=category,
                needs_leader_review=True,
            )
        )

    decisions = [str(d).strip() for d in (payload.get("decisions") or []) if str(d).strip()]
    risks = [str(r).strip() for r in (payload.get("risks") or []) if str(r).strip()]
    keywords = [str(k).strip() for k in (payload.get("keywords") or []) if str(k).strip()]

    return MeetingAnalysisResult(
        summary=summary,
        decisions=decisions,
        todos=todos,
        risks=risks,
        keywords=keywords[:8],
        meeting_meta=MeetingMeta(
            title=request.title,
            meeting_date=request.meeting_date,
            participants=resolve_participants(request),
        ),
    )


def build_todos(raw_text: str, normalized_text: str, meeting_date: str) -> List[MeetingTodo]:
    candidates = extract_speaker_task_candidates(raw_text)
    if not candidates:
        sentences = extract_sentences(
            normalized_text,
            ["담당", "작성", "구현", "정리", "검토", "준비", "연결", "테스트", "제출", "설계"],
            6,
        )
        if not sentences:
            sentences = [
                "회의록 AI 분석 API 구현",
                "분석 결과 화면과 업무 보드 등록 흐름 연결",
                "팀장 검토용 To-Do 승인 화면 점검",
            ]
        candidates = [(extract_assignee_candidate(sentence), sentence) for sentence in sentences]

    try:
        base_date = date.fromisoformat(meeting_date)
    except ValueError:
        base_date = date.today()

    todos: List[MeetingTodo] = []
    for index, (assignee, sentence) in enumerate(candidates):
        todos.append(
            MeetingTodo(
                title=shorten(sentence, 44),
                description=sentence,
                assignee_candidate=assignee,
                due_date=(base_date + timedelta(days=3 + index)).isoformat(),
                priority="HIGH" if index < 2 else "MEDIUM",
                category=infer_category(sentence),
            )
        )
    return todos


_ASSIGNEE_PATTERNS = [
    re.compile(r"^([가-힣]{2,4})(?:은|는|이|가)\s"),
    re.compile(r"담당[:\s]+([가-힣]{2,4})"),
]

# "이름: 발언" 형식의 화자 줄(회의록 전사 포맷)을 인식한다.
_SPEAKER_LINE_PATTERN = re.compile(r"^([가-힣]{2,4})\s*[:：]\s*(.+)$")
_TASK_KEYWORDS = ["담당", "작성", "구현", "정리", "검토", "준비", "연결", "테스트", "제출", "설계", "맡", "잡", "만들", "보여주", "추출"]
_SPEAKER_TASK_LIMIT = 12


def extract_assignee_candidate(sentence: str) -> str:
    """문장에서 "OO가/은/는 ~한다" 또는 "담당: OO" 형태로 적힌 담당자 이름을 추출한다. 없으면 빈 문자열(미배정 후보)."""
    trimmed = sentence.strip()
    for pattern in _ASSIGNEE_PATTERNS:
        match = pattern.search(trimmed)
        if match:
            return match.group(1)
    return ""


def extract_speaker_task_candidates(text: str) -> List[tuple[str, str]]:
    """"이름: 발언" 형식의 회의록 전사에서, 화자가 직접 담당을 언급한 문장만 (화자, 문장) 쌍으로 추출한다.
    화자 줄이 전혀 없는 텍스트(전사 포맷이 아닌 경우)에는 빈 리스트를 반환해 기존 키워드 추출로 대체한다."""
    found: List[tuple[str, str]] = []
    for line in text.splitlines():
        trimmed = line.strip()
        if not trimmed:
            continue
        match = _SPEAKER_LINE_PATTERN.match(trimmed)
        if not match:
            continue
        speaker, utterance = match.group(1), match.group(2)
        for sentence in re.split(r"[.!?。！？]", utterance):
            s = sentence.strip()
            if len(s) < 4:
                continue
            is_commitment = "겠습니다" in s or any(keyword in s for keyword in _TASK_KEYWORDS)
            if is_commitment:
                found.append((speaker, shorten(s, 120)))
            if len(found) >= _SPEAKER_TASK_LIMIT:
                return found
    return found


def extract_sentences(text: str, keywords: List[str], limit: int) -> List[str]:
    results: List[str] = []
    for sentence in split_sentences(text):
        if len(sentence) < 6:
            continue
        if any(keyword in sentence for keyword in keywords):
            results.append(shorten(sentence, 120))
        if len(results) >= limit:
            break
    return results


def split_sentences(text: str) -> List[str]:
    normalized = text.replace("\r", "\n")
    for marker in [".", "?", "!", "。", "？", "！"]:
        normalized = normalized.replace(marker, "\n")
    return [line.strip(" -•\t") for line in normalized.split("\n") if line.strip()]


def infer_category(sentence: str) -> str:
    lower = sentence.lower()
    if "api" in lower or "spring" in lower or "백엔드" in sentence or "서버" in sentence:
        return "BACKEND"
    if "ui" in lower or "react" in lower or "화면" in sentence or "프론트" in sentence:
        return "FRONTEND"
    if "모델" in sentence or "분석" in sentence or "ai" in lower or "llm" in lower:
        return "AI"
    if "데이터" in sentence or "db" in lower or "erd" in lower:
        return "DATABASE"
    if "테스트" in sentence or "검수" in sentence:
        return "QA"
    if "발표" in sentence or "ppt" in lower:
        return "PRESENTATION"
    if "문서" in sentence or "보고서" in sentence or "제안서" in sentence:
        return "DOCUMENT"
    return "ETC"


def build_keywords(text: str, source_type: str) -> List[str]:
    keywords = ["회의록 AI", source_type]
    for candidate in ["Spring Boot", "FastAPI", "LLM", "RAG", "STT", "To-Do", "업무 보드", "대시보드", "기여도", "해커톤", "공모전", "캡스톤"]:
        if candidate in text and candidate not in keywords:
            keywords.append(candidate)
    return keywords[:8]


def normalize_text(text: str) -> str:
    return " ".join(text.split()) if text else ""


def shorten(value: str, max_len: int) -> str:
    return value if len(value) <= max_len else value[: max_len - 1] + "…"
