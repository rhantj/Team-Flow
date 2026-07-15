from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import FastAPI, File, Form, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from llm_rag_assistant.app.routers.chat_router import router as rag_router


app = FastAPI(title="WorkFlow AI FastAPI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rag_router)


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


def analyze_meeting(request: AnalyzeRequest) -> MeetingAnalysisResult:
    text = normalize_text(request.text or request.title)
    participants = [p for p in request.participants if p and p.strip()]
    if not participants:
        participants = ["팀장", "팀원"]

    decisions = extract_sentences(text, ["확정", "결정", "통일", "진행", "사용", "구성"], 5)
    if not decisions:
        decisions = [
            "회의록 분석 결과를 요약, 결정사항, To-Do, 위험요소로 구조화한다.",
            "생성된 To-Do는 팀장 검토 후 업무 보드에 등록한다.",
        ]

    risks = extract_sentences(text, ["위험", "지연", "부족", "오류", "실패", "불안정", "촉박"], 4)
    if not risks:
        risks = ["담당자와 마감일이 명확하지 않은 업무는 일정 지연으로 이어질 수 있다."]

    todos = build_todos(text, request.meeting_date, participants)
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


def build_todos(text: str, meeting_date: str, participants: List[str]) -> List[MeetingTodo]:
    sentences = extract_sentences(
        text,
        ["담당", "작성", "구현", "정리", "검토", "준비", "연결", "테스트", "제출", "설계"],
        6,
    )
    if not sentences:
        sentences = [
            "회의록 AI 분석 API 구현",
            "분석 결과 화면과 업무 보드 등록 흐름 연결",
            "팀장 검토용 To-Do 승인 화면 점검",
        ]

    try:
        base_date = date.fromisoformat(meeting_date)
    except ValueError:
        base_date = date.today()

    todos: List[MeetingTodo] = []
    for index, sentence in enumerate(sentences):
        assignee = participants[index % len(participants)]
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
