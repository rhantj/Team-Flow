# 기여도 리포트 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 심사자가 "리포트 새로고침"을 누르면 업무(tasks)+회의(meetings) 활동을 집계하고 로컬 Ollama로 팀원별 기여도 요약을 생성해 `contribution_reports`에 저장하고 화면에 반영한다.

**Architecture:** 기존 RAG 파이프라인과 동일한 3단 구조 — `ContributorsView.tsx` → Spring `ContributionReportController`(`@PreAuthorize` REVIEWER 검증) → `FastApiContributionClient` → FastAPI `POST /ai/report/contribution`(tasks/meetings 집계 → Ollama 요약 → `contribution_reports` INSERT) → Spring이 응답을 `ApiResponse`로 감싸 반환.

**Tech Stack:** FastAPI + SQLAlchemy(psycopg2) + Ollama(`AsyncClient`), Spring Boot(`RestClient`, Spring Security `@PreAuthorize`), React/TS(`apiFetch`).

## Global Constraints

- 참고 스펙: `document_고무서/superpowers/specs/2026-07-20-contribution-report-pipeline-design.md`
- 신규 엔드포인트 스코프: `contribution_reports`(summary+evidence) 생성/저장까지만. `evaluation_scores`(최종 점수 확정/공개), `github_records`, 산출물 데이터는 다루지 않는다.
- FastAPI `POST /ai/report/contribution`은 RAG(`/ai/rag/query`)와 동일하게 **엔벌로프 없이 데이터를 그대로 반환**한다 (Spring이 실제로 소비하는 유일한 기존 패턴이 이 방식이며, `/ai/score/workload`의 `{success,data}` 엔벌로프는 현재 Spring에서 소비되지 않는 미완성 패턴이므로 따르지 않는다).
- `project_members.role` 컬럼은 `@Enumerated(EnumType.STRING)`으로 저장되므로 SQL에서 `'REVIEWER'`/`'MEMBER'`/`'LEADER'` 영문 값으로 비교한다 (한글 아님).
- 커밋 메시지에 `Co-Authored-By` 트레일러를 추가하지 않는다 (저장소 전역 설정에서 attribution 비활성화됨).

---

### Task 1: FastAPI — 업무/회의 집계 (`contribution_db.py`)

**Files:**
- Create: `App/backend_fastapi/ai_contribution_report/__init__.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/__init__.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/services/__init__.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/services/contribution_db.py`
- Create: `App/backend_fastapi/tests/ai_contribution_report/__init__.py`
- Create: `App/backend_fastapi/tests/ai_contribution_report/test_contribution_db.py`

**Interfaces:**
- Produces: `merge_contribution_rows(task_rows: list[dict], meeting_rows: list[dict]) -> list[dict]` — 각 dict는 `{"user_id": int, "name": str, "todo_done": int, "todo_total": int, "meetings_attended": int, "meetings_total": int}`
- Produces: `load_contribution_inputs(project_id: int) -> list[dict]` — 위와 동일한 shape의 리스트, DB 직접 조회 (Task 2가 사용)
- Produces: `save_contribution_reports(project_id: int, reports: list[dict]) -> None` — `reports`의 각 dict는 `{"user_id": int, "summary": str, "evidence": list[str]}` (Task 2가 사용)

- [ ] **Step 1: 빈 패키지 파일 생성**

```bash
mkdir -p App/backend_fastapi/ai_contribution_report/app/services
mkdir -p App/backend_fastapi/tests/ai_contribution_report
touch App/backend_fastapi/ai_contribution_report/__init__.py
touch App/backend_fastapi/ai_contribution_report/app/__init__.py
touch App/backend_fastapi/ai_contribution_report/app/services/__init__.py
touch App/backend_fastapi/tests/ai_contribution_report/__init__.py
```

- [ ] **Step 2: `merge_contribution_rows`의 실패하는 테스트 작성**

`App/backend_fastapi/tests/ai_contribution_report/test_contribution_db.py`:

```python
from __future__ import annotations

from ai_contribution_report.app.services.contribution_db import merge_contribution_rows


def test_merge_contribution_rows_combines_task_and_meeting_stats():
    task_rows = [
        {"user_id": 1, "name": "김민준", "todo_total": 10, "todo_done": 8},
        {"user_id": 2, "name": "이서연", "todo_total": 3, "todo_done": 3},
    ]
    meeting_rows = [
        {"user_id": 1, "meetings_total": 6, "meetings_attended": 6},
        {"user_id": 2, "meetings_total": 6, "meetings_attended": 5},
    ]

    result = merge_contribution_rows(task_rows, meeting_rows)

    assert result == [
        {"user_id": 1, "name": "김민준", "todo_done": 8, "todo_total": 10,
         "meetings_attended": 6, "meetings_total": 6},
        {"user_id": 2, "name": "이서연", "todo_done": 3, "todo_total": 3,
         "meetings_attended": 5, "meetings_total": 6},
    ]


def test_merge_contribution_rows_defaults_meeting_stats_to_zero_when_missing():
    task_rows = [{"user_id": 3, "name": "박지수", "todo_total": 2, "todo_done": 1}]
    meeting_rows: list[dict] = []

    result = merge_contribution_rows(task_rows, meeting_rows)

    assert result == [
        {"user_id": 3, "name": "박지수", "todo_done": 1, "todo_total": 2,
         "meetings_attended": 0, "meetings_total": 0},
    ]
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/test_contribution_db.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ai_contribution_report.app.services.contribution_db'`

- [ ] **Step 4: `contribution_db.py` 구현**

`App/backend_fastapi/ai_contribution_report/app/services/contribution_db.py`:

```python
from __future__ import annotations

import json

from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine

_TASK_QUERY = text("""
    SELECT
        pm.user_id AS user_id,
        u.name AS name,
        COUNT(t.id) AS todo_total,
        COUNT(t.id) FILTER (WHERE t.status = '완료') AS todo_done
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    LEFT JOIN tasks t ON t.project_id = pm.project_id AND t.assignee_id = pm.user_id
    WHERE pm.project_id = :project_id AND pm.role != 'REVIEWER'
    GROUP BY pm.user_id, u.name
    ORDER BY pm.user_id
""")

_MEETING_QUERY = text("""
    SELECT
        pm.user_id AS user_id,
        COUNT(DISTINCT m.id) AS meetings_total,
        COUNT(DISTINCT ma.meeting_id) AS meetings_attended
    FROM project_members pm
    LEFT JOIN meetings m ON m.project_id = pm.project_id
    LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id AND ma.user_id = pm.user_id
    WHERE pm.project_id = :project_id AND pm.role != 'REVIEWER'
    GROUP BY pm.user_id
""")

_INSERT_QUERY = text("""
    INSERT INTO contribution_reports (project_id, user_id, summary, evidence)
    VALUES (:project_id, :user_id, :summary, CAST(:evidence AS JSONB))
""")


def merge_contribution_rows(task_rows: list[dict], meeting_rows: list[dict]) -> list[dict]:
    """업무 집계와 회의 집계를 user_id 기준으로 합친다. 회의 기록이 없는 유저는 0으로 채운다."""
    meeting_by_user = {row["user_id"]: row for row in meeting_rows}
    merged = []
    for row in task_rows:
        meeting_row = meeting_by_user.get(row["user_id"], {})
        merged.append({
            "user_id": row["user_id"],
            "name": row["name"],
            "todo_done": int(row["todo_done"]),
            "todo_total": int(row["todo_total"]),
            "meetings_attended": int(meeting_row.get("meetings_attended", 0)),
            "meetings_total": int(meeting_row.get("meetings_total", 0)),
        })
    return merged


def load_contribution_inputs(project_id: int) -> list[dict]:
    """project_id의 팀원별 업무 완료율 + 회의 참석률을 tasks/meetings 테이블에서 직접 조회한다."""
    engine = get_engine()
    try:
        with engine.connect() as conn:
            task_rows = [dict(row) for row in conn.execute(_TASK_QUERY, {"project_id": project_id}).mappings()]
            meeting_rows = [dict(row) for row in conn.execute(_MEETING_QUERY, {"project_id": project_id}).mappings()]
    finally:
        engine.dispose()
    return merge_contribution_rows(task_rows, meeting_rows)


def save_contribution_reports(project_id: int, reports: list[dict]) -> None:
    """생성된 리포트를 contribution_reports에 이력으로 INSERT한다 (기존 row를 덮어쓰지 않음)."""
    if not reports:
        return
    engine = get_engine()
    try:
        with engine.begin() as conn:
            for report in reports:
                conn.execute(_INSERT_QUERY, {
                    "project_id": project_id,
                    "user_id": report["user_id"],
                    "summary": report["summary"],
                    "evidence": json.dumps(report["evidence"], ensure_ascii=False),
                })
    finally:
        engine.dispose()
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/test_contribution_db.py -v`
Expected: 2 passed. (`load_contribution_inputs`/`save_contribution_reports`는 `workload_db.py`의 `load_tasks_from_db`와 동일하게 실 DB 접속이 필요해 직접 단위 테스트하지 않는다 — Task 2에서 mock으로 검증)

- [ ] **Step 6: 커밋**

```bash
git add App/backend_fastapi/ai_contribution_report App/backend_fastapi/tests/ai_contribution_report
git commit -m "feat: 기여도 리포트용 업무/회의 집계 쿼리 추가"
```

---

### Task 2: FastAPI — 근거 조립 + LLM 요약 (`contribution_service.py`)

**Files:**
- Create: `App/backend_fastapi/ai_contribution_report/app/schema/__init__.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/schema/contribution_schema.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/services/contribution_service.py`
- Create: `App/backend_fastapi/tests/ai_contribution_report/test_contribution_service.py`

**Interfaces:**
- Consumes: `contribution_db.load_contribution_inputs(project_id: int) -> list[dict]`, `contribution_db.save_contribution_reports(project_id: int, reports: list[dict]) -> None` (Task 1)
- Produces: `MemberContribution` (pydantic, fields `user_id: int, name: str, summary: str, evidence: list[str]`) — Task 3(라우터), Task 4(Spring DTO 필드명 대응)이 사용
- Produces: `build_evidence(row: dict) -> list[str]`
- Produces: `async generate_contribution_reports(project_id: int) -> list[MemberContribution]` — Task 3(라우터)이 호출

- [ ] **Step 1: 스키마 작성 (테스트 불필요 — `workload_schema.py`와 동일하게 순수 데이터 클래스)**

`App/backend_fastapi/ai_contribution_report/app/schema/contribution_schema.py`:

```python
from __future__ import annotations

from pydantic import BaseModel


class ContributionReportRequest(BaseModel):
    project_id: int


class MemberContribution(BaseModel):
    user_id: int
    name: str
    summary: str
    evidence: list[str]
```

```bash
touch App/backend_fastapi/ai_contribution_report/app/schema/__init__.py
```

- [ ] **Step 2: `build_evidence`와 `generate_contribution_reports`의 실패하는 테스트 작성**

`App/backend_fastapi/tests/ai_contribution_report/test_contribution_service.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from ai_contribution_report.app.services.contribution_service import (
    build_evidence,
    generate_contribution_reports,
)


def test_build_evidence_includes_task_and_meeting_stats():
    row = {"user_id": 1, "name": "김민준", "todo_done": 8, "todo_total": 10,
           "meetings_attended": 6, "meetings_total": 6}

    evidence = build_evidence(row)

    assert evidence[0] == "To-Do 8/10건 완료"
    assert "회의 6/6회 참석 (참석률 100%)" in evidence


def test_build_evidence_handles_no_registered_meetings():
    row = {"user_id": 2, "name": "이서연", "todo_done": 0, "todo_total": 0,
           "meetings_attended": 0, "meetings_total": 0}

    evidence = build_evidence(row)

    assert "등록된 회의 없음" in evidence


@pytest.mark.asyncio
async def test_generate_contribution_reports_returns_empty_list_when_no_members():
    with patch(
        "ai_contribution_report.app.services.contribution_service.db.load_contribution_inputs",
        return_value=[],
    ):
        result = await generate_contribution_reports(project_id=1)

    assert result == []


@pytest.mark.asyncio
async def test_generate_contribution_reports_builds_summary_and_saves():
    fake_rows = [
        {"user_id": 1, "name": "김민준", "todo_done": 8, "todo_total": 10,
         "meetings_attended": 6, "meetings_total": 6},
    ]
    with patch(
        "ai_contribution_report.app.services.contribution_service.db.load_contribution_inputs",
        return_value=fake_rows,
    ), patch(
        "ai_contribution_report.app.services.contribution_service.generate_summary",
        AsyncMock(return_value="김민준님은 업무 완료율이 높고 회의에 성실히 참여했습니다."),
    ), patch(
        "ai_contribution_report.app.services.contribution_service.db.save_contribution_reports",
    ) as mock_save:
        result = await generate_contribution_reports(project_id=1)

    assert len(result) == 1
    assert result[0].user_id == 1
    assert result[0].name == "김민준"
    assert result[0].summary == "김민준님은 업무 완료율이 높고 회의에 성실히 참여했습니다."
    assert result[0].evidence[0] == "To-Do 8/10건 완료"
    mock_save.assert_called_once()
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/test_contribution_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ai_contribution_report.app.services.contribution_service'`

- [ ] **Step 4: `contribution_service.py` 구현**

`App/backend_fastapi/ai_contribution_report/app/services/contribution_service.py`:

```python
from __future__ import annotations

import asyncio

from ollama import AsyncClient

from ai_contribution_report.app.schema.contribution_schema import MemberContribution
from ai_contribution_report.app.services import contribution_db as db
from core.config import get_settings

_SUMMARY_SYSTEM_PROMPT = (
    "당신은 WorkFlow AI 프로젝트의 기여도 평가 보조자입니다. "
    "주어진 근거 데이터만 사용해 2~3문장으로 한국어 요약을 작성하고, "
    "근거에 없는 내용은 추측하지 마세요."
)


def build_evidence(row: dict) -> list[str]:
    evidence = [f"To-Do {row['todo_done']}/{row['todo_total']}건 완료"]
    if row["meetings_total"] > 0:
        rate = round(row["meetings_attended"] / row["meetings_total"] * 100)
        evidence.append(f"회의 {row['meetings_attended']}/{row['meetings_total']}회 참석 (참석률 {rate}%)")
    else:
        evidence.append("등록된 회의 없음")
    return evidence


async def generate_summary(row: dict, evidence: list[str]) -> str:
    settings = get_settings()
    client = AsyncClient(host=settings.ollama_host)
    evidence_text = "\n".join(f"- {item}" for item in evidence)
    response = await client.chat(
        model=settings.generation_model,
        messages=[
            {"role": "system", "content": _SUMMARY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"팀원 이름: {row['name']}\n활동 근거:\n{evidence_text}\n\n"
                "위 근거를 바탕으로 이 팀원의 기여도를 2~3문장 한국어로 요약해줘.",
            },
        ],
    )
    return response["message"]["content"]


async def generate_contribution_reports(project_id: int) -> list[MemberContribution]:
    rows = await asyncio.to_thread(db.load_contribution_inputs, project_id)
    if not rows:
        return []

    results: list[MemberContribution] = []
    for row in rows:
        evidence = build_evidence(row)
        summary = await generate_summary(row, evidence)
        results.append(MemberContribution(user_id=row["user_id"], name=row["name"], summary=summary, evidence=evidence))

    await asyncio.to_thread(
        db.save_contribution_reports,
        project_id,
        [{"user_id": r.user_id, "summary": r.summary, "evidence": r.evidence} for r in results],
    )
    return results
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/test_contribution_service.py -v`
Expected: 4 passed

- [ ] **Step 6: 커밋**

```bash
git add App/backend_fastapi/ai_contribution_report/app/schema App/backend_fastapi/ai_contribution_report/app/services/contribution_service.py App/backend_fastapi/tests/ai_contribution_report/test_contribution_service.py
git commit -m "feat: 기여도 근거 조립과 Ollama 요약 생성 로직 추가"
```

---

### Task 3: FastAPI — `/ai/report/contribution` 라우터 등록

**Files:**
- Create: `App/backend_fastapi/ai_contribution_report/app/routers/__init__.py`
- Create: `App/backend_fastapi/ai_contribution_report/app/routers/contribution_router.py`
- Modify: `App/backend_fastapi/app/main.py`
- Create: `App/backend_fastapi/tests/ai_contribution_report/test_contribution_router.py`

**Interfaces:**
- Consumes: `generate_contribution_reports(project_id: int) -> list[MemberContribution]` (Task 2), `ContributionReportRequest`, `MemberContribution` (Task 2)
- Produces: `POST /ai/report/contribution` — Spring `FastApiContributionClient`(Task 4)가 호출하는 실제 엔드포인트

- [ ] **Step 1: 라우터 테스트 작성 (실패 상태)**

`App/backend_fastapi/tests/ai_contribution_report/test_contribution_router.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import ollama
from fastapi.testclient import TestClient

from app.main import app
from ai_contribution_report.app.schema.contribution_schema import MemberContribution

client = TestClient(app)


def test_generate_report_returns_data_when_service_succeeds():
    fake_result = [MemberContribution(user_id=1, name="김민준", summary="요약", evidence=["To-Do 8/10건 완료"])]
    with patch(
        "ai_contribution_report.app.routers.contribution_router.generate_contribution_reports",
        new=AsyncMock(return_value=fake_result),
    ) as mock_generate:
        response = client.post("/ai/report/contribution", json={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body[0]["user_id"] == 1
    assert body[0]["name"] == "김민준"
    mock_generate.assert_awaited_once_with(1)


def test_generate_report_returns_500_with_error_envelope_when_service_raises():
    with patch(
        "ai_contribution_report.app.routers.contribution_router.generate_contribution_reports",
        new=AsyncMock(side_effect=RuntimeError("db unreachable")),
    ):
        response = client.post("/ai/report/contribution", json={"project_id": 1})

    assert response.status_code == 500
    assert response.json()["detail"]["error"]["code"] == "CONTRIBUTION_REPORT_FAILED"


def test_generate_report_returns_503_when_llm_unavailable():
    with patch(
        "ai_contribution_report.app.routers.contribution_router.generate_contribution_reports",
        new=AsyncMock(side_effect=ollama.ResponseError("connection refused")),
    ):
        response = client.post("/ai/report/contribution", json={"project_id": 1})

    assert response.status_code == 503
    assert response.json()["detail"]["error"]["code"] == "CONTRIBUTION_LLM_UNAVAILABLE"
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/test_contribution_router.py -v`
Expected: FAIL — `404` (라우터가 아직 등록되지 않음) 또는 `ModuleNotFoundError`

- [ ] **Step 3: 라우터 구현**

`App/backend_fastapi/ai_contribution_report/app/routers/contribution_router.py`:

```python
from __future__ import annotations

import logging

import httpx
import ollama
from fastapi import APIRouter, HTTPException

from ai_contribution_report.app.schema.contribution_schema import (
    ContributionReportRequest,
    MemberContribution,
)
from ai_contribution_report.app.services.contribution_service import generate_contribution_reports

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/report", tags=["contribution"])


@router.post("/contribution", response_model=list[MemberContribution])
async def generate_report(request: ContributionReportRequest):
    """
    심사자 전용 기여도 리포트 생성.
    Spring Boot가 내부 호출하는 AI 백엔드 엔드포인트.
    """
    try:
        return await generate_contribution_reports(request.project_id)
    except (httpx.ConnectError, httpx.TimeoutException, ollama.ResponseError) as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "success": False,
                "error": {
                    "code": "CONTRIBUTION_LLM_UNAVAILABLE",
                    "message": "AI 요약 서비스에 연결할 수 없습니다.",
                    "details": {},
                },
            },
        ) from exc
    except Exception as exc:
        logger.exception("기여도 리포트 생성 실패 (project_id=%s)", request.project_id)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "CONTRIBUTION_REPORT_FAILED",
                    "message": "기여도 리포트를 생성하지 못했습니다.",
                    "details": {},
                },
            },
        ) from exc
```

```bash
touch App/backend_fastapi/ai_contribution_report/app/routers/__init__.py
```

- [ ] **Step 4: `app/main.py`에 라우터 등록**

`App/backend_fastapi/app/main.py:10-24` 수정:

```python
from llm_rag_assistant.app.routers.chat_router import router as rag_router
from ml_workload_score.app.routers.workload_router import router as workload_router
from ai_contribution_report.app.routers.contribution_router import router as contribution_router

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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/ai_contribution_report/ -v`
Expected: 8 passed (Task 1의 2개 + Task 2의 4개 + 이번 Task의 3개 = 9개일 수 있음, 전부 PASS면 정상)

- [ ] **Step 6: 커밋**

```bash
git add App/backend_fastapi/ai_contribution_report/app/routers App/backend_fastapi/app/main.py App/backend_fastapi/tests/ai_contribution_report/test_contribution_router.py
git commit -m "feat: /ai/report/contribution 라우터 등록"
```

---

### Task 4: Spring — RBAC 검증 + FastAPI 프록시 (`ContributionReportController`)

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionReportRequest.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/MemberContributionDto.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/FastApiContributionClient.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionReportController.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/contribution/ContributionReportControllerTest.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/contribution/ContributionReportSecurityTest.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/contribution/AccessDeniedResponseAdvice.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/security/ProjectAccessTest.java`

**Interfaces:**
- Consumes: `FastApiRagClient`/`RagController`와 동일한 `RestClient` 패턴(`App/backend_spring/src/main/java/com/workflowai/rag/FastApiRagClient.java`), `ProjectAccess.hasRole(Long, String)`(`App/backend_spring/src/main/java/com/workflowai/security/ProjectAccess.java:19`), `RagRateLimiter`
- Produces: `POST /api/v1/ai/contribution/report` — Task 6에서 프론트가 호출하는 실제 엔드포인트

- [ ] **Step 1: 요청/응답 DTO 작성**

`App/backend_spring/src/main/java/com/workflowai/contribution/ContributionReportRequest.java`:

```java
package com.workflowai.contribution;

// React -> Spring -> FastAPI 전 구간에서 동일 스키마를 그대로 사용(FastAPI ContributionReportRequest와 필드명 일치).
public record ContributionReportRequest(Long project_id) {}
```

`App/backend_spring/src/main/java/com/workflowai/contribution/MemberContributionDto.java`:

```java
package com.workflowai.contribution;

import java.util.List;

// 필드명은 FastAPI MemberContribution 스키마와 동일한 snake_case를 사용한다 (RagSourceDto와 동일 관례).
public record MemberContributionDto(Long user_id, String name, String summary, List<String> evidence) {}
```

- [ ] **Step 2: `FastApiContributionClient` 작성**

`App/backend_spring/src/main/java/com/workflowai/contribution/FastApiContributionClient.java`:

```java
package com.workflowai.contribution;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiContributionClient {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    // 팀원 여러 명의 LLM 요약을 순차 생성하므로 RAG 단일 질의(30초)보다 넉넉한 타임아웃이 필요하다.
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(60);

    private final RestClient restClient;

    public FastApiContributionClient(@Value("${workflow.ai.base-url}") String baseUrl) {
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .build();
    }

    public List<MemberContributionDto> generate(ContributionReportRequest request) {
        return restClient.post()
            .uri("/ai/report/contribution")
            .contentType(MediaType.APPLICATION_JSON)
            .body(request)
            .retrieve()
            .body(new ParameterizedTypeReference<List<MemberContributionDto>>() {});
    }
}
```

- [ ] **Step 3: 컨트롤러 테스트 작성 (실패 상태)**

`App/backend_spring/src/test/java/com/workflowai/contribution/ContributionReportControllerTest.java`:

```java
package com.workflowai.contribution;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.rag.RagRateLimiter;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ContributionReportControllerTest {

    @Mock
    private FastApiContributionClient fastApiContributionClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void generateReportReturnsDataFromFastApi() throws Exception {
        List<MemberContributionDto> fastApiResponse = List.of(
            new MemberContributionDto(1L, "김민준", "요약", List.of("To-Do 8/10건 완료"))
        );
        when(fastApiContributionClient.generate(any(ContributionReportRequest.class))).thenReturn(fastApiResponse);

        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data[0].name").value("김민준"))
            .andExpect(jsonPath("$.data[0].summary").value("요약"));
    }

    @Test
    void generateReportReturns503WhenFastApiFails() throws Exception {
        when(fastApiContributionClient.generate(any(ContributionReportRequest.class)))
            .thenThrow(new RuntimeException("connection refused"));

        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("CONTRIBUTION_REPORT_UNAVAILABLE"));
    }

    @Test
    void generateReportReturns429WhenRateLimited() throws Exception {
        ContributionReportController controller = new ContributionReportController(
            fastApiContributionClient,
            new RagRateLimiter(0, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionReportRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/report").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
```

`App/backend_spring/src/test/java/com/workflowai/contribution/ContributionReportSecurityTest.java`는 테스트 전용 method security 컨텍스트에서 `projectAccess.hasRole(..., "REVIEWER") == false`일 때 `POST /api/v1/ai/contribution/report`가 403 + `FORBIDDEN` envelope를 반환하는지 검증한다.

`App/backend_spring/src/test/java/com/workflowai/security/ProjectAccessTest.java`는 `UserPrincipal`을 `SecurityContextHolder`에 넣고, `ProjectRole.REVIEWER`는 `hasRole(..., "REVIEWER") == true`, `ProjectRole.MEMBER`는 false를 반환하는지 검증한다.

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionReportControllerTest"`
Expected: FAIL — 컴파일 에러 (`ContributionReportController` 없음)

- [ ] **Step 5: 컨트롤러 구현**

`App/backend_spring/src/main/java/com/workflowai/contribution/ContributionReportController.java`:

```java
package com.workflowai.contribution;

import com.workflowai.common.ApiResponse;
import com.workflowai.rag.RagRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI 기여도 리포트", description = "심사자 전용 팀원별 기여도 요약 API")
@RestController
@RequestMapping("/api/v1/ai/contribution")
public class ContributionReportController {
    private final FastApiContributionClient fastApiContributionClient;
    private final RagRateLimiter rateLimiter;

    public ContributionReportController(FastApiContributionClient fastApiContributionClient, RagRateLimiter rateLimiter) {
        this.fastApiContributionClient = fastApiContributionClient;
        this.rateLimiter = rateLimiter;
    }

    @Operation(
        summary = "기여도 리포트 생성",
        description = "업무/회의 활동을 집계해 팀원별 AI 기여도 요약을 생성하고 저장합니다. 심사자만 호출 가능합니다."
    )
    @PostMapping("/report")
    @PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")
    public ResponseEntity<ApiResponse<List<MemberContributionDto>>> generateReport(@RequestBody ContributionReportRequest request) {
        if (!rateLimiter.tryAcquire(request.project_id())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요."));
        }

        try {
            List<MemberContributionDto> response = fastApiContributionClient.generate(request);
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("CONTRIBUTION_REPORT_UNAVAILABLE", "기여도 리포트를 생성하지 못했습니다."));
        }
    }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionReportControllerTest"`
Expected: BUILD SUCCESSFUL, 컨트롤러 성공/503/429 테스트, `@PreAuthorize` 403 테스트, `ProjectAccess` REVIEWER/MEMBER 역할 판정 테스트 통과

- [ ] **Step 7: 커밋**

```bash
git add App/backend_spring/src/main/java/com/workflowai/contribution App/backend_spring/src/test/java/com/workflowai/contribution
git commit -m "feat: 기여도 리포트 REVIEWER RBAC 컨트롤러와 FastAPI 프록시 추가"
```

---

### Task 5: Frontend — `contributorsApi.ts`

**Files:**
- Create: `App/frontend/src/contributors/libs/utils/contributorsApi.ts`
- Create: `App/frontend/src/contributors/libs/utils/contributorsApi.test.ts`

**Interfaces:**
- Consumes: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (`App/frontend/src/global/api/apiClient.ts:55`)
- Produces: `fetchContributionReport(projectId: number): Promise<MemberContributionDto[]>`, `MemberContributionDto { userId: number; name: string; summary: string; evidence: string[] }` — Task 6이 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`App/frontend/src/contributors/libs/utils/contributorsApi.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchContributionReport } from "./contributorsApi";
import { apiFetch } from "../../../global/api/apiClient";

vi.mock("../../../global/api/apiClient", () => ({
  apiFetch: vi.fn(),
}));

describe("fetchContributionReport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("converts snake_case response to camelCase", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      { user_id: 1, name: "김민준", summary: "요약입니다", evidence: ["To-Do 8/10건 완료"] },
    ]);

    const result = await fetchContributionReport(1);

    expect(apiFetch).toHaveBeenCalledWith("/ai/contribution/report", {
      method: "POST",
      body: JSON.stringify({ project_id: 1 }),
    });
    expect(result).toEqual([
      { userId: 1, name: "김민준", summary: "요약입니다", evidence: ["To-Do 8/10건 완료"] },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/frontend && npx vitest run src/contributors/libs/utils/contributorsApi.test.ts`
Expected: FAIL — `Cannot find module './contributorsApi'`

- [ ] **Step 3: `contributorsApi.ts` 구현**

`App/frontend/src/contributors/libs/utils/contributorsApi.ts`:

```ts
import { apiFetch } from "../../../global/api/apiClient";

interface RawMemberContribution {
  user_id: number;
  name: string;
  summary: string;
  evidence: string[];
}

export interface MemberContributionDto {
  userId: number;
  name: string;
  summary: string;
  evidence: string[];
}

export async function fetchContributionReport(projectId: number): Promise<MemberContributionDto[]> {
  const data = await apiFetch<RawMemberContribution[]>("/ai/contribution/report", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId }),
  });
  return data.map((item) => ({
    userId: item.user_id,
    name: item.name,
    summary: item.summary,
    evidence: item.evidence,
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/frontend && npx vitest run src/contributors/libs/utils/contributorsApi.test.ts`
Expected: 1 passed

- [ ] **Step 5: 커밋**

```bash
git add App/frontend/src/contributors/libs/utils/contributorsApi.ts App/frontend/src/contributors/libs/utils/contributorsApi.test.ts
git commit -m "feat: 기여도 리포트 API 클라이언트 추가"
```

---

### Task 6: Frontend — `ContributorsView.tsx`에 실 API 연동

**Files:**
- Modify: `App/frontend/src/contributors/screen/ContributorsView.tsx`

**Interfaces:**
- Consumes: `fetchContributionReport(projectId: number): Promise<MemberContributionDto[]>` (Task 5)

이 태스크는 기존 mock(`CONTRIB_REPORTS`)의 `score`/`categories`/`commits`/`prs`/`color`는 그대로 두고, `aiSummary`/`evidence`만 실 API 응답으로 덮어쓴다 (스펙의 비목표: `evaluation_scores`/`github_records`는 이번 스코프 밖).

- [ ] **Step 1: import 추가**

`App/frontend/src/contributors/screen/ContributorsView.tsx:29` 다음 줄에 추가:

```tsx
import { fetchAttendanceSummary, type MeetingAttendanceSummaryDto } from "../../meetings/libs/utils/meetingAiApi";
import { fetchContributionReport, type MemberContributionDto } from "../libs/utils/contributorsApi";
import { useAuth } from "../../global/hooks/useAuth";
```

- [ ] **Step 2: 리포트 오버라이드 상태와 새로고침 핸들러 추가**

`App/frontend/src/contributors/screen/ContributorsView.tsx:84` (`const [memo, setMemo] = useState("");` 바로 다음)에 추가:

```tsx
  const [memo, setMemo] = useState("");
  const [reportOverrides, setReportOverrides] = useState<Record<string, { summary: string; evidence: string[] }>>({});
  const [isRefreshingReport, setIsRefreshingReport] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const mergedReports = useMemo(
    () =>
      CONTRIB_REPORTS.map((report) => {
        const override = reportOverrides[report.memberId];
        if (!override) return report;
        return { ...report, aiSummary: override.summary, evidence: override.evidence };
      }),
    [reportOverrides],
  );

  const handleRefreshReport = async () => {
    if (currentProjectId == null) return;
    setIsRefreshingReport(true);
    setRefreshError(null);
    try {
      const reports = await fetchContributionReport(currentProjectId);
      setReportOverrides(
        Object.fromEntries(
          reports.map((report: MemberContributionDto) => [
            String(report.userId),
            { summary: report.summary, evidence: report.evidence },
          ]),
        ),
      );
    } catch {
      setRefreshError("기여도 리포트를 새로고침하지 못했습니다.");
    } finally {
      setIsRefreshingReport(false);
    }
  };
```

- [ ] **Step 3: 파생 값들이 `mergedReports`를 참조하도록 수정**

`App/frontend/src/contributors/screen/ContributorsView.tsx:86-100` 교체:

```tsx
  const requestedTeamId = useMemo(() => new URLSearchParams(location.search).get("team"), [location.search]);
  const selectedTeam = REVIEWER_TEAMS.find((team) => team.id === requestedTeamId) ?? REVIEWER_TEAMS[0];
  const filteredReports = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return mergedReports;
    return mergedReports.filter((report) => {
      const haystack = [
        report.name,
        report.role,
        report.aiSummary,
        ...report.evidence,
      ].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [query, mergedReports]);
```

`App/frontend/src/contributors/screen/ContributorsView.tsx:102-107` 교체:

```tsx
  const selectedMember = mergedReports.find((report) => report.memberId === selectedMemberId) ?? mergedReports[0];
  const averageScore = Math.round(mergedReports.reduce((sum, report) => sum + report.score, 0) / mergedReports.length);
  const publishedCount = Object.values(publicFlags).filter(Boolean).length;
  const evidenceCount = mergedReports.reduce((sum, report) => sum + report.evidence.length, 0);
  const completedTasks = mergedReports.reduce((sum, report) => sum + report.todoDone, 0);
  const totalTasks = mergedReports.reduce((sum, report) => sum + report.todoTotal, 0);
```

- [ ] **Step 4: "리포트 새로고침" 버튼에 핸들러 연결**

`App/frontend/src/contributors/screen/ContributorsView.tsx:144-148` 교체:

```tsx
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefreshReport}
              disabled={isRefreshingReport || currentProjectId == null}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingReport ? "animate-spin" : ""}`} />
              {isRefreshingReport ? "새로고침 중..." : "리포트 새로고침"}
            </button>
```

- [ ] **Step 5: 새로고침 실패 시 에러 문구 표시**

`App/frontend/src/contributors/screen/ContributorsView.tsx:138-141` 교체:

```tsx
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded-md bg-muted text-foreground font-semibold">심사자 전용</span>
              <span>팀원에게는 공개 처리된 최종 점수와 코멘트만 노출됩니다.</span>
            </div>
            {refreshError && (
              <p className="mt-2 text-xs font-semibold text-red-600">{refreshError}</p>
            )}
```

- [ ] **Step 6: 타입체크**

Run: `cd App/frontend && npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 개발 서버로 수동 확인**

Run: `cd App/frontend && npm run dev` (별도 터미널)

브라우저에서 `/contributors` 화면(또는 라우팅 경로) 접속 후:
1. "리포트 새로고침" 클릭 시 버튼이 "새로고침 중..."으로 바뀌고 스피너가 도는지 확인
2. FastAPI/Ollama가 아직 로컬에 없다면 에러 문구("기여도 리포트를 새로고침하지 못했습니다.")가 표시되는지 확인 — 이는 정상 동작(에러 핸들링 검증)
3. FastAPI+Ollama가 떠 있다면 목록의 `AI 분석 요약`과 `분석 근거`가 실제 응답으로 갱신되는지 확인, `score`/카테고리 막대 등 기존 mock 값은 그대로인지 확인

- [ ] **Step 8: 커밋**

```bash
git add App/frontend/src/contributors/screen/ContributorsView.tsx
git commit -m "feat: 기여도 리포트 새로고침을 실 API와 연동"
```

---

## Self-Review 결과

- **스펙 커버리지:** 아키텍처(Task 1-4), API 계약(Task 3-4), DB 쓰기 정책(Task 1 `save_contribution_reports`), 에러 처리(Task 3 503/500, Task 4 503), 프론트 연동(Task 5-6), 테스트(각 태스크의 Step) — 스펙의 모든 섹션이 태스크로 매핑됨. `evaluation_scores` 등 비목표 항목은 의도적으로 태스크 없음.
- **플레이스홀더 스캔:** 없음. 모든 스텝에 실행 가능한 코드/명령 포함.
- **타입 일관성:** `MemberContribution`(FastAPI, `user_id/name/summary/evidence`) → `MemberContributionDto`(Spring, 동일 snake_case 필드) → `MemberContributionDto`(Frontend, camelCase 변환) 순으로 필드명이 각 계층의 기존 관례(RagSourceDto 등)를 따라 일관되게 유지됨.

Plan complete and saved to `document_고무서/superpowers/plans/2026-07-20-contribution-report-pipeline-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
