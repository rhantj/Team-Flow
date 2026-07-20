# FS-09 기여도 점수(contribution score) 계산 모델 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** workload/task/meeting 3개 피처의 가중 평균으로 팀원별 기여도 점수를 계산하는 FastAPI
엔드포인트(`/ai/score/contribution`)를 만든다. 가중치는 균등 평균이 아니라 PCA/엔트로피 가중법으로
오프라인 산출해서 코드에 반영한다.

**Architecture:** `ml_workload_score`와 동일한 3계층 구조(schema/services/routers)의 새 모듈
`contribution_score`를 만든다. `get_workload_score()`를 함수로 직접 호출해 workload+task 피처를
동시에 얻고, `meeting_attendees`/`meetings` 테이블을 새로 조회해 meeting 피처를 얻은 뒤 가중 평균한다.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy(동기, `workload_db.get_engine()` 재사용),
pandas/numpy/scikit-learn(가중치 실험), pytest + `unittest.mock`, Jupyter(가중치 실험 노트북).

## Global Constraints

- 새 모듈은 `App/backend_fastapi/ml_workload_score`와 동일한 `app/{schema,services,routers}` 3계층
  구조로 만든다. 각 디렉터리와 상위 패키지에 빈 `__init__.py`가 있어야 한다(기존 모듈과 동일).
- `get_workload_score()`는 HTTP로 재호출하지 않고 Python 함수로 직접 import해서 호출한다.
- DB 접근은 `core.db.get_pool()`이 아니라 `ml_workload_score.app.services.workload_db.get_engine()`
  패턴(동기 SQLAlchemy, `dotenv_values()` 기반 설정 로딩)을 재사용한다 — 이 dev 환경에서
  `core.config.get_settings()`가 `App/.env`를 못 찾는 문제가 실측 확인되어 있다
  (`document_이은주/superpowers/specs/2026-07-16-workload-embedding-difficulty-design.md` 참고).
- workload 피처의 방향성 보정: `anomaly_type == "저활동 의심"`일 때만 `100 - overload_score`,
  그 외(`정상`/`과부하 의심`/`이상 패턴(방향 불명확)`)는 `100`. 이 조건문은 정확히 이 형태를 유지한다
  (스펙 문서 `document_이은주/superpowers/specs/2026-07-20-contribution-score-design.md` 참고).
- GitHub(개발 기여) 피처는 이번 스코프에 포함하지 않는다 — 3피처(workload/task/meeting)만 계산한다.
- 가중치는 요청마다 재계산하지 않는다. Task 4의 노트북 실험 결과를 상수로 고정해서 코드에 반영한다.
- Spring 연동, 프론트 실데이터 연결은 이 계획의 범위 밖이다(다음 계획으로 별도 진행).
- 관련 스펙: `document_이은주/superpowers/specs/2026-07-20-contribution-score-design.md`

---

### Task 1: 스키마 + 순수 계산 함수 (`contribution_schema.py`, `contribution_service.py`)

**Files:**
- Create: `App/backend_fastapi/contribution_score/__init__.py` (빈 파일)
- Create: `App/backend_fastapi/contribution_score/app/__init__.py` (빈 파일)
- Create: `App/backend_fastapi/contribution_score/app/schema/__init__.py` (빈 파일)
- Create: `App/backend_fastapi/contribution_score/app/services/__init__.py` (빈 파일)
- Create: `App/backend_fastapi/contribution_score/app/routers/__init__.py` (빈 파일)
- Create: `App/backend_fastapi/contribution_score/app/schema/contribution_schema.py`
- Create: `App/backend_fastapi/contribution_score/app/services/contribution_service.py`
- Create: `App/backend_fastapi/tests/contribution_score/__init__.py` (빈 파일)
- Test: `App/backend_fastapi/tests/contribution_score/test_contribution_service.py`

**Interfaces:**
- Produces: `ContributionMemberResult`, `ContributionScoreData`, `ContributionScoreResponse` (Pydantic 모델, Task 3에서 라우터가 사용)
- Produces: `workload_component_of(member: WorkloadMemberResult) -> float`
- Produces: `meeting_component_of(attended: int, total: int) -> float`
- Produces: `compute_contribution_scores(workload_members: list[WorkloadMemberResult], attendance: dict[str, int], total_meetings: int) -> list[ContributionMemberResult]` — Task 3에서 라우터가 이 시그니처로 호출
- Produces: `WEIGHT_WORKLOAD`, `WEIGHT_TASK`, `WEIGHT_MEETING` (모듈 상수, 초기값 각 1/3 — Task 4에서 실험 결과로 갱신)
- Consumes: `ml_workload_score.app.schema.workload_schema.WorkloadMemberResult` (기존, 수정 없음)

- [ ] **Step 1: 빈 `__init__.py` 5개 생성**

```bash
cd App/backend_fastapi
mkdir -p contribution_score/app/schema contribution_score/app/services contribution_score/app/routers tests/contribution_score
touch contribution_score/__init__.py contribution_score/app/__init__.py \
      contribution_score/app/schema/__init__.py contribution_score/app/services/__init__.py \
      contribution_score/app/routers/__init__.py tests/contribution_score/__init__.py
```

- [ ] **Step 2: 실패하는 테스트부터 작성**

`App/backend_fastapi/tests/contribution_score/test_contribution_service.py`:

```python
from __future__ import annotations

import pytest

from contribution_score.app.services.contribution_service import (
    compute_contribution_scores,
    meeting_component_of,
    workload_component_of,
)
from ml_workload_score.app.schema.workload_schema import WorkloadMemberResult


def _member(assignee_id="1", completion_rate=0.5, overload_score=0.0, anomaly_type="정상") -> WorkloadMemberResult:
    return WorkloadMemberResult(
        assignee_id=assignee_id,
        task_count_total=10,
        completion_rate=completion_rate,
        overload_score=overload_score,
        is_anomaly=anomaly_type != "정상",
        anomaly_type=anomaly_type,
    )


def test_workload_component_penalizes_low_activity():
    member = _member(overload_score=82.5, anomaly_type="저활동 의심")
    assert workload_component_of(member) == pytest.approx(17.5)


def test_workload_component_does_not_penalize_overload():
    member = _member(overload_score=82.5, anomaly_type="과부하 의심")
    assert workload_component_of(member) == 100.0


def test_workload_component_normal_is_full_score():
    member = _member(overload_score=5.0, anomaly_type="정상")
    assert workload_component_of(member) == 100.0


def test_workload_component_clamps_at_zero_for_extreme_outlier():
    member = _member(overload_score=150.0, anomaly_type="저활동 의심")
    assert workload_component_of(member) == 0.0


def test_meeting_component_no_meetings_held_is_full_score():
    assert meeting_component_of(attended=0, total=0) == 100.0


def test_meeting_component_partial_attendance():
    assert meeting_component_of(attended=3, total=4) == 75.0


def test_meeting_component_full_attendance():
    assert meeting_component_of(attended=5, total=5) == 100.0


def test_compute_contribution_scores_missing_attendance_defaults_to_zero():
    members = [_member(assignee_id="9", completion_rate=0.8, overload_score=0.0, anomaly_type="정상")]
    results = compute_contribution_scores(members, attendance={}, total_meetings=4)

    assert len(results) == 1
    result = results[0]
    assert result.assignee_id == "9"
    assert result.workload_component == 100.0
    assert result.task_component == 80.0
    assert result.meeting_component == 0.0
    assert result.contribution_score == pytest.approx((100.0 + 80.0 + 0.0) / 3, abs=0.1)


def test_compute_contribution_scores_uses_equal_weights_by_default():
    from contribution_score.app.services import contribution_service as svc

    assert svc.WEIGHT_WORKLOAD == pytest.approx(1 / 3)
    assert svc.WEIGHT_TASK == pytest.approx(1 / 3)
    assert svc.WEIGHT_MEETING == pytest.approx(1 / 3)
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'contribution_score.app.services.contribution_service'`

- [ ] **Step 4: `contribution_schema.py` 구현**

```python
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class ContributionMemberResult(BaseModel):
    assignee_id: str
    workload_component: float
    task_component: float
    meeting_component: float
    contribution_score: float


class ContributionScoreData(BaseModel):
    schema_version: str = "1.0"
    project_id: int
    members: list[ContributionMemberResult]
    note: Optional[str] = None


class ContributionScoreResponse(BaseModel):
    success: bool
    data: Optional[ContributionScoreData] = None
    error: Optional[dict] = None
```

- [ ] **Step 5: `contribution_service.py` 구현**

```python
from __future__ import annotations

from contribution_score.app.schema.contribution_schema import ContributionMemberResult
from ml_workload_score.app.schema.workload_schema import WorkloadMemberResult

# 균등 가중치로 시작 - Task 4의 PCA/엔트로피 실험 결과로 갱신 예정.
WEIGHT_WORKLOAD = 1 / 3
WEIGHT_TASK = 1 / 3
WEIGHT_MEETING = 1 / 3


def workload_component_of(member: WorkloadMemberResult) -> float:
    """
    overload_score는 과부하든 저활동이든 이상치면 값이 커진다(방향을 구분하지 않음).
    기여도 관점에서는 저활동만 감점 대상이어야 하므로, 저활동 의심일 때만
    100에서 빼서 반영하고 그 외(정상/과부하/불명확)는 만점 처리한다.
    """
    if member.anomaly_type == "저활동 의심":
        return max(0.0, 100.0 - member.overload_score)
    return 100.0


def meeting_component_of(attended: int, total: int) -> float:
    """전체 회의가 0건이면 참석 못 할 회의가 없었던 것이므로 불이익 없이 만점 처리."""
    if total <= 0:
        return 100.0
    return round(attended / total * 100, 1)


def compute_contribution_scores(
    workload_members: list[WorkloadMemberResult],
    attendance: dict[str, int],
    total_meetings: int,
) -> list[ContributionMemberResult]:
    """
    workload_members: get_workload_score()가 반환한 팀원 목록(workload+task 피처의 원천).
    attendance: {assignee_id(str): 참석 횟수} — load_meeting_attendance()의 첫 번째 반환값.
    총 회의 수는 total_meetings로 별도 전달(모든 팀원에게 공통값).
    workload_members에는 있지만 attendance에 없는 팀원은 참석 0회로 처리한다
    (결측이 아니라 "회의에 한 번도 참석하지 않음"이 맞는 해석).
    """
    results: list[ContributionMemberResult] = []
    for member in workload_members:
        workload_comp = workload_component_of(member)
        task_comp = round(member.completion_rate * 100, 1)
        meeting_comp = meeting_component_of(attendance.get(member.assignee_id, 0), total_meetings)
        score = round(
            WEIGHT_WORKLOAD * workload_comp + WEIGHT_TASK * task_comp + WEIGHT_MEETING * meeting_comp,
            1,
        )
        results.append(
            ContributionMemberResult(
                assignee_id=member.assignee_id,
                workload_component=workload_comp,
                task_component=task_comp,
                meeting_component=meeting_comp,
                contribution_score=score,
            )
        )
    return results
```

- [ ] **Step 6: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_service.py -v`
Expected: `9 passed`

- [ ] **Step 7: 커밋**

```bash
git add App/backend_fastapi/contribution_score App/backend_fastapi/tests/contribution_score
git commit -m "feat: 기여도 점수 계산 순수 함수(contribution_service) + 스키마 추가"
```

---

### Task 2: 회의 참석 집계 (`contribution_db.py`)

**Files:**
- Create: `App/backend_fastapi/contribution_score/app/services/contribution_db.py`
- Test: `App/backend_fastapi/tests/contribution_score/test_contribution_db.py`

**Interfaces:**
- Produces: `load_meeting_attendance(project_id: int) -> tuple[dict[str, int], int]` — Task 3에서 라우터가 이 시그니처로 호출 (반환: `({assignee_id(str): 참석 횟수}, 전체 회의 수)`)
- Consumes: `ml_workload_score.app.services.workload_db.get_engine` (기존, 수정 없음)

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/contribution_score/test_contribution_db.py`:

```python
from __future__ import annotations

from unittest.mock import MagicMock, patch

from contribution_score.app.services import contribution_db as cdb


def test_load_meeting_attendance_happy_path():
    fake_attendance_rows = [
        {"assignee_id": 1, "attended_count": 3},
        {"assignee_id": 2, "attended_count": 5},
    ]
    mock_execute_result = MagicMock()
    mock_execute_result.mappings.return_value.all.return_value = fake_attendance_rows
    mock_execute_result.scalar_one.return_value = 5
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value = mock_execute_result
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(cdb, "get_engine", return_value=mock_engine):
        attendance, total = cdb.load_meeting_attendance(project_id=1)

    assert attendance == {"1": 3, "2": 5}
    assert total == 5
    mock_engine.dispose.assert_called_once()


def test_load_meeting_attendance_no_meetings():
    mock_execute_result = MagicMock()
    mock_execute_result.mappings.return_value.all.return_value = []
    mock_execute_result.scalar_one.return_value = 0
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value = mock_execute_result
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(cdb, "get_engine", return_value=mock_engine):
        attendance, total = cdb.load_meeting_attendance(project_id=1)

    assert attendance == {}
    assert total == 0
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_db.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'contribution_score.app.services.contribution_db'`

- [ ] **Step 3: `contribution_db.py` 구현**

```python
from __future__ import annotations

from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine

_ATTENDANCE_QUERY = text("""
    SELECT ma.user_id AS assignee_id, COUNT(*) AS attended_count
    FROM meeting_attendees ma
    JOIN meetings m ON m.id = ma.meeting_id
    WHERE m.project_id = :project_id
    GROUP BY ma.user_id
""")

_TOTAL_MEETINGS_QUERY = text("""
    SELECT COUNT(*) AS total FROM meetings WHERE project_id = :project_id
""")


def load_meeting_attendance(project_id: int) -> tuple[dict[str, int], int]:
    """
    특정 프로젝트의 (팀원별 회의 참석 횟수, 전체 회의 수)를 반환한다.
    meeting_attendees는 "회의 참석자 태깅(기여도 근거로도 사용)" 목적으로 이미 설계된 테이블.
    """
    engine = get_engine()
    try:
        with engine.connect() as conn:
            attendance_rows = conn.execute(
                _ATTENDANCE_QUERY, {"project_id": project_id}
            ).mappings().all()
            total_meetings = conn.execute(
                _TOTAL_MEETINGS_QUERY, {"project_id": project_id}
            ).scalar_one()
    finally:
        engine.dispose()

    attendance = {str(row["assignee_id"]): int(row["attended_count"]) for row in attendance_rows}
    return attendance, int(total_meetings)
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_db.py -v`
Expected: `2 passed`

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/contribution_score/app/services/contribution_db.py \
        App/backend_fastapi/tests/contribution_score/test_contribution_db.py
git commit -m "feat: meeting_attendees 기반 회의 참석 집계(contribution_db) 추가"
```

---

### Task 3: 라우터 연결 + 앱 등록 (`contribution_router.py`)

**Files:**
- Create: `App/backend_fastapi/contribution_score/app/routers/contribution_router.py`
- Modify: `App/backend_fastapi/app/main.py`
- Test: `App/backend_fastapi/tests/contribution_score/test_contribution_router.py`

**Interfaces:**
- Consumes: `ml_workload_score.app.services.workload_service.get_workload_score(project_id, use_synthetic_fallback=False)` (기존)
- Consumes: `contribution_score.app.services.contribution_db.load_meeting_attendance(project_id)` (Task 2)
- Consumes: `contribution_score.app.services.contribution_service.compute_contribution_scores(...)` (Task 1)
- Produces: `POST /ai/score/contribution?project_id=` HTTP 엔드포인트

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/contribution_score/test_contribution_router.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from ml_workload_score.app.schema.workload_schema import WorkloadMemberResult, WorkloadScoreData

client = TestClient(app)


def _fake_workload_data() -> WorkloadScoreData:
    return WorkloadScoreData(
        project_id=1,
        source="db",
        method="MAD (소규모 팀)",
        members=[
            WorkloadMemberResult(
                assignee_id="3", task_count_total=10, completion_rate=0.8,
                overload_score=10.0, is_anomaly=False, anomaly_type="정상",
            )
        ],
    )


def test_score_contribution_returns_success_when_service_succeeds() -> None:
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(return_value=_fake_workload_data()),
    ), patch(
        "contribution_score.app.routers.contribution_router.load_meeting_attendance",
        return_value=({"3": 4}, 5),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    member = body["data"]["members"][0]
    assert member["assignee_id"] == "3"
    assert member["task_component"] == 80.0
    assert member["meeting_component"] == 80.0
    assert member["workload_component"] == 100.0


def test_score_contribution_returns_500_with_error_envelope_when_workload_fails() -> None:
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(side_effect=RuntimeError("db unreachable")),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 500
    assert response.json()["detail"]["error"]["code"] == "CONTRIBUTION_SCORE_FAILED"


def test_score_contribution_empty_members_returns_note() -> None:
    empty_workload = WorkloadScoreData(
        project_id=1, source="db", method="N/A", members=[], note="배정된 업무가 없습니다.",
    )
    with patch(
        "contribution_score.app.routers.contribution_router.get_workload_score",
        new=AsyncMock(return_value=empty_workload),
    ):
        response = client.post("/ai/score/contribution", params={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["data"]["members"] == []
    assert body["data"]["note"] is not None
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/test_contribution_router.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'contribution_score.app.routers.contribution_router'`

- [ ] **Step 3: `contribution_router.py` 구현**

```python
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from contribution_score.app.schema.contribution_schema import (
    ContributionScoreData,
    ContributionScoreResponse,
)
from contribution_score.app.services.contribution_db import load_meeting_attendance
from contribution_score.app.services.contribution_service import compute_contribution_scores
from ml_workload_score.app.services.workload_service import get_workload_score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/score", tags=["contribution"])


@router.post("/contribution", response_model=ContributionScoreResponse)
async def score_contribution(project_id: int):
    """
    FS-09 기여도 점수 (workload/task/meeting 3피처 가중 평균).
    Spring Boot가 내부 호출하는 AI 백엔드 엔드포인트.
    """
    try:
        workload_data = await get_workload_score(project_id)

        if not workload_data.members:
            data = ContributionScoreData(
                project_id=project_id,
                members=[],
                note="배정된 업무가 없어 기여도 점수를 계산할 수 없습니다.",
            )
            return {"success": True, "data": data}

        attendance, total_meetings = load_meeting_attendance(project_id)
        members = compute_contribution_scores(workload_data.members, attendance, total_meetings)
        data = ContributionScoreData(project_id=project_id, members=members)
        return {"success": True, "data": data}
    except Exception:
        logger.exception("기여도 점수 계산 실패 (project_id=%s)", project_id)
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": {
                    "code": "CONTRIBUTION_SCORE_FAILED",
                    "message": "기여도 점수를 계산하지 못했습니다.",
                    "details": {},
                },
            },
        )
```

- [ ] **Step 4: `app/main.py`에 라우터 등록**

`App/backend_fastapi/app/main.py`의 기존 import/등록 줄(10-11, 23-24번) 바로 아래에 추가:

```python
from contribution_score.app.routers.contribution_router import router as contribution_router
```

```python
app.include_router(contribution_router)
```

- [ ] **Step 5: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests/contribution_score/ -v`
Expected: `14 passed` (Task 1의 9개 + Task 2의 2개 + Task 3의 3개)

- [ ] **Step 6: 전체 스위트 회귀 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests -q`
Expected: 기존 전체 통과 + 신규 14개 추가, 실패 0건

- [ ] **Step 7: 실제 서버로 라이브 확인 (수동, pytest 아님)**

```bash
cd App/backend_fastapi
../../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010 &
curl -s -X POST "http://127.0.0.1:8010/ai/score/contribution?project_id=1"
```

Expected: `success: true`, 실제 Supabase project_id=1 팀원들의 `workload_component`/`task_component`/
`meeting_component`/`contribution_score`가 채워진 응답. 확인 후 서버 종료
(`taskkill //F //PID <pid>` 또는 `kill %1`).

- [ ] **Step 8: 커밋**

```bash
git add App/backend_fastapi/contribution_score/app/routers/contribution_router.py \
        App/backend_fastapi/app/main.py \
        App/backend_fastapi/tests/contribution_score/test_contribution_router.py
git commit -m "feat: /ai/score/contribution 엔드포인트 추가 및 앱 등록"
```

---

### Task 4: 가중치 실험 (PCA/엔트로피) → 확정 가중치 반영

**Files:**
- Create: `document_이은주/01-contribution-weight-experiment.ipynb`
- Create: `document_이은주/2026-07-20-contribution-weight-experiment.md`
- Modify: `App/backend_fastapi/contribution_score/app/services/contribution_service.py:8-10` (`WEIGHT_*` 상수)
- Modify: `App/backend_fastapi/tests/contribution_score/test_contribution_service.py` (균등 가중치 검증 테스트를 확정값 검증으로 교체)

**Interfaces:**
- Consumes: `contribution_score.app.services.contribution_service.WEIGHT_WORKLOAD/WEIGHT_TASK/WEIGHT_MEETING` (Task 1에서 1/3로 정의됨, 이 태스크에서 실험값으로 갱신)

- [ ] **Step 1: 노트북 생성, 셀 1 — 합성 피처 데이터 생성**

`document_이은주/01-contribution-weight-experiment.ipynb`의 첫 코드 셀:

```python
import numpy as np
import pandas as pd

np.random.seed(42)


def generate_synthetic_contribution_features(n: int = 60) -> pd.DataFrame:
    """
    workload/task/meeting 3피처를 0~100 스케일의 현실적인 팀원 분포로 합성한다.
    실 프로젝트(project_id=1)는 팀원 4명뿐이라 그 데이터만으로 PCA/엔트로피 가중치를
    산출하면 분산 추정 자체가 불안정하다(워크로드 스코어의 IsolationForest가 소표본에서
    불안정했던 것과 같은 문제) - 표본을 보강해서 가중치를 산출한다.
    """
    workload = np.clip(np.random.normal(loc=85, scale=15, size=n), 0, 100)
    task = np.clip(np.random.normal(loc=75, scale=20, size=n), 0, 100)
    meeting = np.clip(np.random.normal(loc=80, scale=18, size=n), 0, 100)
    return pd.DataFrame({"workload": workload, "task": task, "meeting": meeting})


features_df = generate_synthetic_contribution_features()
features_df.describe()
```

- [ ] **Step 2: 셀 2 — 실 데이터 병합 (있으면)**

```python
import httpx

# 로컬에 docker compose 스택이 떠 있어야 함 (backend-fastapi:8000)
try:
    resp = httpx.post(
        "http://localhost:8000/ai/score/contribution", params={"project_id": 1}, timeout=10
    )
    resp.raise_for_status()
    real_members = resp.json()["data"]["members"]
    real_df = pd.DataFrame(
        [
            {
                "workload": m["workload_component"],
                "task": m["task_component"],
                "meeting": m["meeting_component"],
            }
            for m in real_members
        ]
    )
    print(f"실 데이터 {len(real_df)}건 병합")
    features_df = pd.concat([features_df, real_df], ignore_index=True)
except Exception as e:
    print(f"실 데이터 조회 실패(합성 데이터만 사용): {e}")

features_df.shape
```

- [ ] **Step 3: 셀 3 — 엔트로피 가중법**

```python
def entropy_weights(df: pd.DataFrame) -> dict[str, float]:
    """
    표준 엔트로피 가중법: 각 피처 열의 정보량(엔트로피)이 낮을수록(=팀원 간 변별력이
    클수록) 높은 가중치를 준다. 라벨이 필요 없는 비지도 방법.
    """
    eps = 1e-9
    proportions = df / (df.sum(axis=0) + eps)
    n = len(df)
    entropy = -(proportions * np.log(proportions + eps)).sum(axis=0) / np.log(n)
    diversification = 1 - entropy
    weights = diversification / diversification.sum()
    return weights.to_dict()


entropy_result = entropy_weights(features_df)
entropy_result
```

- [ ] **Step 4: 셀 4 — PCA 가중치**

```python
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


def pca_weights(df: pd.DataFrame) -> dict[str, float]:
    """1주성분의 절댓값 로딩을 정규화해서 가중치로 쓴다."""
    scaled = StandardScaler().fit_transform(df)
    pca = PCA(n_components=1)
    pca.fit(scaled)
    loadings = np.abs(pca.components_[0])
    weights = loadings / loadings.sum()
    return dict(zip(df.columns, weights)), pca.explained_variance_ratio_[0]


pca_result, explained_variance = pca_weights(features_df)
print(pca_result, f"설명 분산 비율: {explained_variance:.3f}")
```

- [ ] **Step 5: 셀 5 — 비교 그래프 저장**

```python
import os

import matplotlib.pyplot as plt

os.makedirs("../App/output/contribution_score", exist_ok=True)

methods_df = pd.DataFrame({"entropy": entropy_result, "pca": pca_result}).T

fig, ax = plt.subplots(figsize=(6, 4))
methods_df.plot(kind="bar", ax=ax)
ax.set_title("Contribution Score 가중치 비교 (entropy vs PCA)")
ax.set_ylabel("weight")
ax.legend(title="feature")
plt.tight_layout()
plt.savefig("../App/output/contribution_score/weight_comparison.png")
plt.show()
```

- [ ] **Step 6: 셀 6 — 최종 가중치 결정 및 출력**

```python
# 극단적으로 한 피처에 가중치가 쏠리면(0.9 이상) 균등 평균으로 폴백 - 의사결정 로직을 코드로 남김
def choose_final_weights(entropy_w: dict, pca_w: dict, explained_variance: float) -> dict:
    if explained_variance < 0.5:
        # 1주성분이 전체 분산의 절반도 설명 못하면 PCA 근거가 약하다고 보고 엔트로피 채택
        chosen, method = entropy_w, "entropy"
    else:
        chosen, method = pca_w, "pca"

    if max(chosen.values()) >= 0.9:
        chosen = {k: 1 / 3 for k in chosen}
        method = "equal (fallback - 한 피처 쏠림)"

    print(f"선택된 방법: {method}")
    return chosen


final_weights = choose_final_weights(entropy_result, pca_result, explained_variance)
final_weights
```

- [ ] **Step 7: 노트북 실행, 실제 산출된 가중치 확인**

노트북을 처음 셀부터 끝까지 실행하고 `final_weights` 출력값을 기록해둔다(다음 스텝에서 이 값을
그대로 코드에 반영).

- [ ] **Step 8: 결과 문서 작성**

`document_이은주/2026-07-20-contribution-weight-experiment.md`:

```markdown
# 기여도 점수 가중치 실험 결과

작성일: 2026-07-20

## 데이터
합성 데이터 60건 + 실 프로젝트(project_id=1) N건.

## 결과
- 엔트로피 가중법: workload=X.XXX, task=X.XXX, meeting=X.XXX
- PCA(1주성분, 설명분산비율 X.XXX): workload=X.XXX, task=X.XXX, meeting=X.XXX
- 최종 채택: [entropy|pca|equal] — 사유: [choose_final_weights 로직에 따른 선택 이유]

## 반영
`App/backend_fastapi/contribution_score/app/services/contribution_service.py`의
`WEIGHT_WORKLOAD`/`WEIGHT_TASK`/`WEIGHT_MEETING`을 위 최종 채택 값으로 갱신.

## 그래프
`App/output/contribution_score/weight_comparison.png`
```

(Step 7에서 실제로 나온 숫자를 `X.XXX` 자리에 채워 넣는다.)

- [ ] **Step 9: `contribution_service.py`의 가중치 상수 갱신**

`App/backend_fastapi/contribution_score/app/services/contribution_service.py`의 8-10번 줄
(`WEIGHT_WORKLOAD = 1 / 3` 등 3줄)을 Step 7에서 확인한 실제 값으로 교체:

```python
# 2026-07-20 PCA/엔트로피 가중치 실험 결과 반영 (document_이은주/2026-07-20-contribution-weight-experiment.md)
WEIGHT_WORKLOAD = <실험값>
WEIGHT_TASK = <실험값>
WEIGHT_MEETING = <실험값>
```

- [ ] **Step 10: 기존 "균등 가중치" 테스트를 확정값 검증으로 교체**

`test_contribution_service.py`의 `test_compute_contribution_scores_uses_equal_weights_by_default`
테스트를 다음으로 교체(정확한 값은 Step 7에서 나온 `final_weights`와 동일하게):

```python
def test_compute_contribution_scores_uses_experiment_derived_weights():
    from contribution_score.app.services import contribution_service as svc

    total = svc.WEIGHT_WORKLOAD + svc.WEIGHT_TASK + svc.WEIGHT_MEETING
    assert total == pytest.approx(1.0)
    assert svc.WEIGHT_WORKLOAD == pytest.approx(<실험값>)
    assert svc.WEIGHT_TASK == pytest.approx(<실험값>)
    assert svc.WEIGHT_MEETING == pytest.approx(<실험값>)
```

- [ ] **Step 11: 전체 스위트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && ../../.venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 통과, 실패 0건 (가중치가 바뀌어도 `compute_contribution_scores`의 join/방향성 로직
테스트들은 절대값이 아니라 각 컴포넌트 자체를 검증하므로 영향 없음 — `contribution_score`가 걸린
`test_compute_contribution_scores_missing_attendance_defaults_to_zero`의 마지막 assert만
`abs=0.1`로 이미 여유를 뒀으므로 재확인 필요)

- [ ] **Step 12: 커밋**

```bash
git add document_이은주/01-contribution-weight-experiment.ipynb \
        document_이은주/2026-07-20-contribution-weight-experiment.md \
        App/backend_fastapi/contribution_score/app/services/contribution_service.py \
        App/backend_fastapi/tests/contribution_score/test_contribution_service.py \
        App/output/contribution_score/weight_comparison.png
git commit -m "feat: PCA/엔트로피 가중치 실험 결과를 기여도 점수 계산에 반영"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 스펙의 3피처 공식(workload 방향성 보정/task 재사용/meeting 비율)은 Task 1,
  회의 참석 집계는 Task 2, 엔드포인트·에러 처리·빈 프로젝트 케이스는 Task 3, 가중치 실험 절차
  (PCA/엔트로피/노트북/그래프/문서화/코드 반영)는 Task 4에 전부 매핑됨. "스코프 밖"(GitHub 피처,
  Spring 연동, 프론트 연결, 프로젝트별 가중치)은 의도적으로 태스크에 없음.
- **플레이스홀더**: Task 4의 `<실험값>`/`X.XXX`만 예외 — 이건 실행해야 나오는 실제 데이터 값이라
  본질적으로 사전에 채울 수 없다(계획 자체가 "실험을 실행하고 그 결과를 반영하라"는 절차이므로).
  나머지 모든 코드 블록은 완전히 실행 가능한 코드.
- **타입/시그니처 일관성**: `compute_contribution_scores(workload_members, attendance, total_meetings)`
  (Task 1 정의)를 Task 3 라우터가 동일 인자 순서로 호출. `load_meeting_attendance(project_id) ->
  tuple[dict[str, int], int]`(Task 2 정의)를 Task 3이 `attendance, total_meetings = ...`로 정확히
  동일하게 언패킹. `WEIGHT_*` 상수명이 Task 1(정의)과 Task 4(갱신)에서 동일.
- **기존 코드와의 일관성 확인**: `workload_router.py`의 에러 응답 형식(`WORKLOAD_SCORE_FAILED`,
  `{"success": False, "error": {...}}`)을 그대로 패턴화해서 `CONTRIBUTION_SCORE_FAILED`로 적용,
  `main.py` 라우터 등록도 기존 두 줄(`rag_router`, `workload_router`)과 동일한 방식.
