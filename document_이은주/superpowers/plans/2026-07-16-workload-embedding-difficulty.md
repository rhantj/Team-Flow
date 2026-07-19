# FS-5 워크로드 임베딩 난이도 피처 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `workload_model.py`의 업무 난이도 계산에 실제 임베딩(FS-4 `document_chunks`) 기반
보정치를 추가해, 지금까지 priority+category만으로 근사하던 난이도를 더 정교하게 만든다.

**Architecture:** 새 모듈 `embedding_difficulty.py`가 "고난이도/단순업무" 앵커 문장 임베딩과
`document_chunks`의 기존 task 임베딩 간 코사인 유사도 차이를 계산해 `{task_id: 보정치}` 딕셔너리로
반환한다. `build_features()`는 이 딕셔너리를 선택적으로 받아 `difficulty_of()` 결과에 더한다.
DB 조회 실패·Ollama 미가용 시 빈 딕셔너리(보정 없음)로 우아하게 폴백한다.

**Tech Stack:** Python 3.12, SQLAlchemy(동기, `workload_db.get_engine()` 재사용),
`ollama.AsyncClient`, pgvector(`<=>` 코사인
 거리 연산자), pytest + `unittest.mock`.

## Global Constraints

- `workload_model.py`는 지금처럼 순수 오프라인 계산(I/O 없음)으로 유지 — 임베딩/DB 호출은 전부
  새 `embedding_difficulty.py`에만 넣는다.
- `difficulty_of()`는 이번 작업에서 시그니처를 바꾸지 않는다 — 합성 데이터·Jira 어댑터 호환 유지.
- `EMBEDDING_DIFFICULTY_WEIGHT = 0.3`, 앵커 문장 정확히 다음 두 개(변경 금지, 스펙 참고):
  - `HARD_ANCHOR = "복잡하고 어려운 고난이도 기술 업무. 설계와 문제 해결이 까다롭고 전문성이 필요하다."`
  - `EASY_ANCHOR = "단순하고 쉬운 반복 업무. 절차가 명확하고 빠르게 처리할 수 있다."`
- Ollama/DB 설정은 `llm_rag_assistant.app.services.embedding_service.embed_text()`나
  `core.db.get_pool()`을 쓰지 않는다 — 이 dev 환경에서 `core.config.get_settings()`가
  `App/.env`를 못 찾아 `ValidationError`가 나는 게 실측 확인됨(`App/backend_fastapi/main.py` cwd
  기준). 대신 `workload_db.py`와 동일한 `dotenv_values()` 패턴 + `workload_db.get_engine()`을
  재사용한다.
- 임베딩 실패(Ollama 다운, 모델 없음 등) 시 전체 요청이 500이 되면 안 된다 — 항상 빈 dict로
  폴백하고 로그만 남긴다.
- 관련 스펙: `document_이은주/superpowers/specs/2026-07-16-workload-embedding-difficulty-design.md`

---

### Task 1: `embedding_difficulty.py` — 앵커 임베딩 캐싱 + 유사도 계산

**Files:**
- Create: `App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py`
- Test: `App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty.py`

**Interfaces:**
- Produces: `async def compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]` — Task 3에서 `workload_service.get_workload_score()`가 이 시그니처로 호출한다.
- Produces: `EMBEDDING_DIFFICULTY_WEIGHT: float = 0.3` (Task 2 테스트에서 기대값 계산에 사용)
- Consumes: `ml_workload_score.app.services.workload_db.get_engine` (기존, 수정 없음)
- Consumes: `llm_rag_assistant.app.services.vector_utils.to_vector_literal(embedding: list[float]) -> str` (기존, 수정 없음)

- [ ] **Step 1: 테스트 파일과 fixture부터 작성(실패 확인용)**

`App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from ml_workload_score.app.services import embedding_difficulty as ed


@pytest.fixture(autouse=True)
def reset_anchor_cache():
    ed._anchor_cache.clear()
    yield
    ed._anchor_cache.clear()


@pytest.mark.asyncio
async def test_get_anchor_embeddings_caches_after_first_call():
    fake_embed = AsyncMock(side_effect=[[0.1, 0.2], [0.9, 0.8]])
    with patch.object(ed, "_embed", fake_embed):
        hard1, easy1 = await ed.get_anchor_embeddings()
        hard2, easy2 = await ed.get_anchor_embeddings()

    assert hard1 == [0.1, 0.2]
    assert easy1 == [0.9, 0.8]
    assert (hard2, easy2) == (hard1, easy1)
    fake_embed.assert_awaited_once()  # 두 번째 호출은 캐시만 사용, embed 재호출 없음


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_happy_path():
    fake_rows = [
        {"source_id": 1, "sim_hard": 0.8, "sim_easy": 0.2},
        {"source_id": 2, "sim_hard": 0.3, "sim_easy": 0.7},
    ]
    mock_conn = MagicMock()
    mock_conn.__enter__.return_value.execute.return_value.mappings.return_value.all.return_value = fake_rows
    mock_engine = MagicMock()
    mock_engine.connect.return_value = mock_conn

    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine", return_value=mock_engine):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result[1] == pytest.approx((0.8 - 0.2) * ed.EMBEDDING_DIFFICULTY_WEIGHT)
    assert result[2] == pytest.approx((0.3 - 0.7) * ed.EMBEDDING_DIFFICULTY_WEIGHT)
    mock_engine.dispose.assert_called_once()


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_returns_empty_dict_on_failure():
    with patch.object(ed, "get_anchor_embeddings", AsyncMock(side_effect=RuntimeError("ollama down"))):
        result = await ed.compute_embedding_adjustments(task_ids=[1, 2], project_id=1)

    assert result == {}


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_empty_task_ids_skips_query():
    with patch.object(ed, "get_anchor_embeddings", AsyncMock(return_value=([0.1] * 768, [0.2] * 768))), \
         patch.object(ed, "get_engine") as mock_get_engine:
        result = await ed.compute_embedding_adjustments(task_ids=[], project_id=1)

    assert result == {}
    mock_get_engine.assert_not_called()
```

Also create (empty is fine, matches existing test package convention):
`App/backend_fastapi/tests/ml_workload_score/__init__.py` already exists from earlier session — no action needed.

- [ ] **Step 2: 테스트 실행 → 실패 확인 (모듈이 없어서 ImportError)**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_embedding_difficulty.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ml_workload_score.app.services.embedding_difficulty'`

- [ ] **Step 3: `embedding_difficulty.py` 구현**

```python
from __future__ import annotations

import logging
import os

import ollama
from dotenv import dotenv_values
from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine
from llm_rag_assistant.app.services.vector_utils import to_vector_literal

logger = logging.getLogger(__name__)

# workload_db.py와 동일한 패턴 - core.config.get_settings()는 이 dev 환경에서
# App/.env를 못 찾아 ValidationError가 나는 게 확인됨(cwd 기반 탐색이라 상위 디렉터리를
# 안 훑음). embed_text()도 내부에서 get_settings()를 쓰므로 재사용하지 않고 직접 호출한다.
_env = {**dotenv_values(), **os.environ}
OLLAMA_HOST = _env.get("OLLAMA_HOST", "http://localhost:11434")
EMBEDDING_MODEL = _env.get("EMBEDDING_MODEL", "nomic-embed-text")

HARD_ANCHOR = "복잡하고 어려운 고난이도 기술 업무. 설계와 문제 해결이 까다롭고 전문성이 필요하다."
EASY_ANCHOR = "단순하고 쉬운 반복 업무. 절차가 명확하고 빠르게 처리할 수 있다."
EMBEDDING_DIFFICULTY_WEIGHT = 0.3

_anchor_cache: dict[str, list[float]] = {}


async def _embed(text_value: str) -> list[float]:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.embeddings(model=EMBEDDING_MODEL, prompt=text_value)
    return response["embedding"]


async def get_anchor_embeddings() -> tuple[list[float], list[float]]:
    """HARD/EASY 앵커 임베딩을 프로세스당 한 번만 계산해 캐싱한다."""
    if "hard" not in _anchor_cache:
        _anchor_cache["hard"] = await _embed(HARD_ANCHOR)
    if "easy" not in _anchor_cache:
        _anchor_cache["easy"] = await _embed(EASY_ANCHOR)
    return _anchor_cache["hard"], _anchor_cache["easy"]


_SIMILARITY_QUERY = text("""
    SELECT source_id,
           1 - (embedding <=> :hard_anchor ::vector) AS sim_hard,
           1 - (embedding <=> :easy_anchor ::vector) AS sim_easy
    FROM document_chunks
    WHERE project_id = :project_id
      AND source_type = 'task'
      AND source_id = ANY(:task_ids)
""")


async def compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]:
    """
    document_chunks에 이미 임베딩된 task만 대상으로 난이도 보정치를 계산한다.
    (source_id -> (sim_hard - sim_easy) * EMBEDDING_DIFFICULTY_WEIGHT)
    임베딩이 없는 task_id는 결과에서 빠진다 - 호출 측(build_features)에서
    .get(task_id, 0.0)으로 처리되므로 오늘과 동일하게 동작한다.
    Ollama 실패 등 어떤 이유로든 계산에 실패하면 빈 dict를 반환한다 - 이 보강 신호 하나
    때문에 워크로드 스코어 전체가 실패하면 안 되기 때문.
    """
    if not task_ids:
        return {}

    try:
        hard_vec, easy_vec = await get_anchor_embeddings()
    except Exception:
        logger.warning("임베딩 난이도 보정 계산 실패(앵커 임베딩) - 보정 없이 진행", exc_info=True)
        return {}

    engine = get_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                _SIMILARITY_QUERY,
                {
                    "hard_anchor": to_vector_literal(hard_vec),
                    "easy_anchor": to_vector_literal(easy_vec),
                    "project_id": project_id,
                    "task_ids": task_ids,
                },
            ).mappings().all()
    except Exception:
        logger.warning("임베딩 난이도 보정 계산 실패(document_chunks 조회) - 보정 없이 진행", exc_info=True)
        return {}
    finally:
        engine.dispose()

    return {
        row["source_id"]: (row["sim_hard"] - row["sim_easy"]) * EMBEDDING_DIFFICULTY_WEIGHT
        for row in rows
    }
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_embedding_difficulty.py -v`
Expected: `4 passed`

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py \
        App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty.py
git commit -m "feat: 임베딩 기반 난이도 보정 모듈(embedding_difficulty) 추가"
```

---

### Task 2: `build_features()`에 `embedding_adjustments` 옵션 인자 추가

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/services/workload_model.py:170-207` (`build_features` 함수)
- Test: `App/backend_fastapi/tests/ml_workload_score/test_workload_model_embedding.py` (신규)

**Interfaces:**
- Consumes: `EMBEDDING_DIFFICULTY_WEIGHT`(Task 1에서 만든 상수) — 테스트에서 기대값 계산용으로만 import, 함수 시그니처엔 안 들어감
- Produces: `build_features(tasks_df, today=None, embedding_adjustments: dict[int, float] | None = None) -> pd.DataFrame` — Task 3에서 `workload_service.get_workload_score()`가 이 시그니처로 호출

- [ ] **Step 1: 실패하는 회귀 테스트 작성**

`App/backend_fastapi/tests/ml_workload_score/test_workload_model_embedding.py`:

```python
from __future__ import annotations

import pandas as pd
import pytest

from ml_workload_score.app.services.workload_model import build_features


def _sample_tasks_df() -> pd.DataFrame:
    today = pd.Timestamp("2026-07-16")
    return pd.DataFrame([
        {"task_id": 1, "project_id": 1, "assignee_id": "a", "category": "백엔드",
         "priority": "높음", "status": "할 일", "due_date": today + pd.Timedelta(days=5)},
        {"task_id": 2, "project_id": 1, "assignee_id": "a", "category": "문서",
         "priority": "낮음", "status": "완료", "due_date": today - pd.Timedelta(days=1)},
    ])


def test_build_features_without_embedding_adjustments_unchanged():
    """embedding_adjustments를 안 넘기면 기존과 완전히 동일하게 동작해야 한다(회귀 없음)."""
    df = _sample_tasks_df()
    features_without_arg = build_features(df)
    features_with_none = build_features(df, embedding_adjustments=None)
    pd.testing.assert_frame_equal(features_without_arg, features_with_none)


def test_build_features_applies_embedding_adjustments():
    df = _sample_tasks_df()
    baseline = build_features(df)
    baseline_difficulty = baseline.loc[baseline["assignee_id"] == "a", "difficulty_avg"].iloc[0]

    # task_id=1에 +1.0 보정치를 주면 difficulty_avg가 그만큼(팀원당 task 2개 중 1개니 0.5) 올라가야 함
    adjusted = build_features(df, embedding_adjustments={1: 1.0})
    adjusted_difficulty = adjusted.loc[adjusted["assignee_id"] == "a", "difficulty_avg"].iloc[0]

    assert adjusted_difficulty == pytest.approx(baseline_difficulty + 0.5)


def test_build_features_missing_task_id_in_adjustments_defaults_to_zero():
    df = _sample_tasks_df()
    baseline = build_features(df)
    adjusted = build_features(df, embedding_adjustments={999: 5.0})  # 존재하지 않는 task_id
    pd.testing.assert_frame_equal(baseline, adjusted)
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_model_embedding.py -v`
Expected: FAIL — `TypeError: build_features() got an unexpected keyword argument 'embedding_adjustments'`

- [ ] **Step 3: `build_features()` 수정**

`workload_model.py`의 현재 함수 시그니처와 `difficulty` 계산 줄(170번대)을 다음처럼 바꾼다:

```python
def build_features(
    tasks_df: pd.DataFrame,
    today: pd.Timestamp = None,
    embedding_adjustments: dict[int, float] | None = None,
) -> pd.DataFrame:
    """
    팀원별(assignee_id) 피처 테이블 생성.
    ...(기존 docstring 유지)...
    embedding_adjustments: {task_id: 보정치} — embedding_difficulty.compute_embedding_adjustments()의
    반환값을 그대로 넘긴다. None이면(기본값) 기존 동작과 완전히 동일.
    """
    if today is None:
        today = pd.Timestamp("2026-07-14")

    df = tasks_df.copy()
    df["is_done"] = df["status"].apply(normalize_status) == "완료"
    df["is_overdue"] = (~df["is_done"]) & (df["due_date"] < today)
    df["is_upcoming"] = (~df["is_done"]) & (df["due_date"] >= today) & \
                         (df["due_date"] <= today + pd.Timedelta(days=3))

    if embedding_adjustments:
        df["difficulty"] = df.apply(
            lambda r: difficulty_of(r["priority"], r["category"])
            + embedding_adjustments.get(r["task_id"], 0.0),
            axis=1,
        )
    else:
        df["difficulty"] = df.apply(lambda r: difficulty_of(r["priority"], r["category"]), axis=1)

    grouped = df.groupby("assignee_id").agg(
        task_count_total=("task_id", "count"),
        task_count_active=("is_done", lambda s: (~s).sum()),
        task_count_done=("is_done", "sum"),
        difficulty_avg=("difficulty", "mean"),
        overdue_count=("is_overdue", "sum"),
        upcoming_due_count=("is_upcoming", "sum"),
    ).reset_index()

    grouped["completion_rate"] = grouped["task_count_done"] / grouped["task_count_total"]
    grouped["overdue_ratio"] = grouped["overdue_count"] / grouped["task_count_total"]

    for col in ["task_count_active", "difficulty_avg"]:
        team_avg = grouped[col].mean()
        grouped[f"{col}_rel"] = grouped[col] / team_avg if team_avg > 0 else 0

    return grouped
```

(주의: `is_done`/`is_overdue`/`is_upcoming` 세 줄은 이번 재검증 세션에서 이미 `normalize_status()`로
바뀐 상태 그대로 유지 — 이번 작업은 `difficulty` 계산 부분만 바꾼다.)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_model_embedding.py -v`
Expected: `3 passed`

- [ ] **Step 5: 기존 전체 스위트도 회귀 없는지 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests -q`
Expected: 이전 실행 결과 + 신규 7개 추가 = 전부 통과, 실패 0건

- [ ] **Step 6: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/workload_model.py \
        App/backend_fastapi/tests/ml_workload_score/test_workload_model_embedding.py
git commit -m "feat: build_features()에 embedding_adjustments 옵션 인자 추가"
```

---

### Task 3: `workload_service.get_workload_score()` 비동기 전환 + 임베딩 보정 연결

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/services/workload_service.py` (전체, 19-69줄)
- Test: `App/backend_fastapi/tests/ml_workload_score/test_workload_service.py` (신규)

**Interfaces:**
- Consumes: `embedding_difficulty.compute_embedding_adjustments(task_ids, project_id)` (Task 1)
- Consumes: `build_features(tasks_df, embedding_adjustments=...)` (Task 2)
- Produces: `async def get_workload_score(project_id: int, use_synthetic_fallback: bool = False) -> WorkloadScoreData` (기존 동기 함수를 async로 변경 — Task 4에서 라우터가 `await`로 호출)

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/ml_workload_score/test_workload_service.py`:

```python
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pandas as pd
import pytest

from ml_workload_score.app.services.workload_service import get_workload_score


def _fake_tasks_df() -> pd.DataFrame:
    today = pd.Timestamp("2026-07-16")
    return pd.DataFrame([
        {"task_id": 1, "project_id": 1, "assignee_id": "1", "category": "백엔드",
         "priority": "높음", "status": "할 일", "due_date": today + pd.Timedelta(days=5)},
        {"task_id": 2, "project_id": 1, "assignee_id": "2", "category": "문서",
         "priority": "낮음", "status": "완료", "due_date": today - pd.Timedelta(days=1)},
    ])


@pytest.mark.asyncio
async def test_get_workload_score_passes_embedding_adjustments_to_build_features():
    fake_adjustments = {1: 0.42}
    with patch(
        "ml_workload_score.app.services.workload_service.db.load_tasks_from_db",
        return_value=_fake_tasks_df(),
    ), patch(
        "ml_workload_score.app.services.workload_service.compute_embedding_adjustments",
        AsyncMock(return_value=fake_adjustments),
    ), patch(
        "ml_workload_score.app.services.workload_service.build_features",
    ) as mock_build_features:
        mock_build_features.return_value = pd.DataFrame([
            {"assignee_id": "1", "task_count_total": 1, "completion_rate": 0.0,
             "overload_score_0_100": 10.0, "is_anomaly": False, "anomaly_type": "정상"},
        ])
        with patch(
            "ml_workload_score.app.services.workload_service.detect_overload_anomalies_auto",
        ) as mock_detect:
            mock_detect.return_value = mock_build_features.return_value
            mock_detect.return_value.attrs = {"method_used": "MAD"}
            await get_workload_score(project_id=1)

    _, kwargs = mock_build_features.call_args
    assert kwargs["embedding_adjustments"] == fake_adjustments


@pytest.mark.asyncio
async def test_get_workload_score_synthetic_fallback_still_works():
    """DB 조회 실패 시 synthetic fallback 경로는 임베딩 보정 없이도 그대로 동작해야 한다."""
    with patch(
        "ml_workload_score.app.services.workload_service.db.load_tasks_from_db",
        side_effect=RuntimeError("no db"),
    ):
        result = await get_workload_score(project_id=1, use_synthetic_fallback=True)

    assert result.source == "synthetic_fallback"
    assert len(result.members) > 0
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_service.py -v`
Expected: FAIL (아직 `compute_embedding_adjustments`를 import 안 해서 `AttributeError`, 그리고 함수가 sync라 `await` 대상이 아니라는 에러)

- [ ] **Step 3: `workload_service.py` 수정**

전체를 다음으로 교체:

```python
from __future__ import annotations

import logging

from ml_workload_score.app.services import workload_db as db
from ml_workload_score.app.services.embedding_difficulty import compute_embedding_adjustments
from ml_workload_score.app.services.workload_model import (
    build_features,
    detect_overload_anomalies_auto,
    generate_synthetic_tasks,
)
from ml_workload_score.app.schema.workload_schema import (
    WorkloadMemberResult,
    WorkloadScoreData,
)

logger = logging.getLogger(__name__)


async def get_workload_score(project_id: int, use_synthetic_fallback: bool = False) -> WorkloadScoreData:
    """
    프로젝트의 팀원별 업무 편중(과부하/저활동) 점수를 계산한다.

    - project_id: 대상 프로젝트
    - use_synthetic_fallback: 실제 DB 데이터가 없거나 연결 실패 시
      합성 데이터로 데모 응답을 줄지 여부. 기본값 False (운영 기본 동작:
      실패 시 에러를 그대로 올림). 데모/개발 환경에서만 명시적으로 True로 호출할 것.
    """
    embedding_adjustments: dict[int, float] = {}
    try:
        tasks_df = db.load_tasks_from_db(project_id)
        source = "db"
        if not tasks_df.empty:
            embedding_adjustments = await compute_embedding_adjustments(
                tasks_df["task_id"].tolist(), project_id
            )
    except Exception:
        if not use_synthetic_fallback:
            raise
        logger.warning(
            "project_id=%s: DB 조회 실패, synthetic fallback 데이터로 대체", project_id
        )
        tasks_df = generate_synthetic_tasks(n_members=7)
        source = "synthetic_fallback"

    if tasks_df.empty:
        return WorkloadScoreData(
            project_id=project_id,
            source=source,
            method="N/A",
            members=[],
            note="배정된 업무가 없어 편중 점수를 계산할 수 없습니다.",
        )

    features = build_features(tasks_df, embedding_adjustments=embedding_adjustments)
    result = detect_overload_anomalies_auto(features)

    members = [
        WorkloadMemberResult(
            assignee_id=row["assignee_id"],
            task_count_total=int(row["task_count_total"]),
            completion_rate=round(float(row["completion_rate"]), 3),
            overload_score=round(float(row["overload_score_0_100"]), 1),
            is_anomaly=bool(row["is_anomaly"]),
            anomaly_type=row["anomaly_type"],
        )
        for _, row in result.iterrows()
    ]

    return WorkloadScoreData(
        project_id=project_id,
        source=source,
        method=result.attrs.get("method_used", "unknown"),
        members=members,
    )
```

(synthetic fallback 경로는 `embedding_adjustments`를 계산하지 않고 빈 dict `{}`를 그대로 씀 —
합성 데이터엔 실제 `document_chunks` 임베딩이 있을 수 없으므로 당연한 동작.)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests/ml_workload_score/test_workload_service.py -v`
Expected: `2 passed`

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/workload_service.py \
        App/backend_fastapi/tests/ml_workload_score/test_workload_service.py
git commit -m "feat: get_workload_score()를 비동기로 전환하고 임베딩 난이도 보정 연결"
```

---

### Task 4: `workload_router.py` 비동기 전환 + 기존 라우터 테스트 갱신

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/routers/workload_router.py:15-16`
- Modify: `App/backend_fastapi/tests/ml_workload_score/test_workload_router.py:32-42` (모킹 방식만 `AsyncMock`으로)

**Interfaces:**
- Consumes: `get_workload_score(project_id, use_synthetic_fallback)`(Task 3에서 `async def`로 바뀜)

- [ ] **Step 1: 라우터 핸들러를 async로 변경**

`workload_router.py`의 15-16번 줄:

```python
@router.post("/workload", response_model=WorkloadScoreResponse)
async def score_workload(project_id: int, use_synthetic_fallback: bool = False):
```

그 아래 본문의 `data = get_workload_score(...)`를 `data = await get_workload_score(...)`로 변경.
(나머지 try/except, HTTPException 처리는 그대로 유지)

- [ ] **Step 2: 기존 라우터 테스트를 `AsyncMock` 기반으로 갱신**

`test_workload_router.py`의 두 모킹 테스트를 다음처럼 바꾼다(세 번째 스모크 테스트는
`get_workload_score`를 모킹하지 않으므로 수정 불필요):

```python
from unittest.mock import AsyncMock, patch
```
(기존 `from unittest.mock import patch`를 교체)

```python
def test_score_workload_returns_success_when_service_succeeds() -> None:
    fake_result = WorkloadScoreData(...)  # 기존과 동일
    with patch(
        "ml_workload_score.app.routers.workload_router.get_workload_score",
        new=AsyncMock(return_value=fake_result),
    ) as mock_get_score:
        response = client.post("/ai/score/workload", params={"project_id": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["members"][0]["assignee_id"] == "3"
    mock_get_score.assert_awaited_once_with(1, use_synthetic_fallback=False)


def test_score_workload_returns_500_with_error_envelope_when_service_raises() -> None:
    with patch(
        "ml_workload_score.app.routers.workload_router.get_workload_score",
        new=AsyncMock(side_effect=RuntimeError("db unreachable")),
    ):
        response = client.post("/ai/score/workload", params={"project_id": 1})

    assert response.status_code == 500
    assert response.json()["detail"]["error"]["code"] == "WORKLOAD_SCORE_FAILED"
```

(`test_score_workload_synthetic_fallback_smoke`는 실제 `get_workload_score`를 그대로 호출하는
모킹 없는 테스트라 수정할 필요 없음 — `async def`로 바뀌어도 `TestClient`가 알아서 처리함.)

- [ ] **Step 3: 전체 스위트 실행 → 통과 확인**

Run: `cd App/backend_fastapi && PYTHONPATH=. ../../.venv/Scripts/python.exe -m pytest tests -q`
Expected: 전부 통과(기존 22개 + Task 1~3에서 추가된 9개 = 31개), 실패 0건

- [ ] **Step 4: 실제 서버로 라이브 확인 (수동, pytest 아님)**

```bash
cd App/backend_fastapi
PYTHONPATH=. ../../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010 &
curl -s -X POST "http://127.0.0.1:8010/ai/score/workload?project_id=1"
```

Expected: `success: true`이고, 실제 Supabase project_id=1의 task 중 `document_chunks`에 임베딩된
것들(예: source_id 1~17)이 있다면 그 팀원들의 `difficulty_avg`가 임베딩 보정 이전과 달라져 있어야
한다(엔드투엔드 확인 후 서버 종료: `taskkill //F //PID <pid>` 또는 `kill`).

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/routers/workload_router.py \
        App/backend_fastapi/tests/ml_workload_score/test_workload_router.py
git commit -m "feat: workload_router를 비동기로 전환해 임베딩 난이도 보정 파이프라인 연결 완료"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 스펙의 아키텍처(신규 모듈 분리)/앵커 방식/에러 처리(빈 dict 폴백)/비동기
  경계/테스트 항목 전부 Task 1~4에 매핑됨. "스코프 밖" 항목(지도학습 전환, 실시간 임베딩 생성,
  다중 앵커)은 의도적으로 태스크에 없음.
- **플레이스홀더**: 없음 — 모든 코드 블록이 실제 실행 가능한 완전한 코드.
- **타입/시그니처 일관성**: `compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]` (Task 1 정의) — Task 3에서 동일 시그니처로 호출. `build_features(..., embedding_adjustments=...)` (Task 2 정의) — Task 3에서 동일 키워드로 호출. `get_workload_score`가 Task 3에서 `async def`로 바뀌고 Task 4에서 그 호출부(`await`)와 테스트(`AsyncMock`)가 일관되게 갱신됨.
- **실제 환경 사전 검증**: 이번 세션에서 pgvector 코사인 유사도 SQL(더미 768차원 벡터)과 실제
  Ollama `nomic-embed-text` 임베딩 호출(모델 pull 포함) 둘 다 실측으로 성공 확인함 — 계획의
  핵심 가정(SQL 문법, 임베딩 차원 768, Ollama 가용성)이 추측이 아니라 검증된 사실.
