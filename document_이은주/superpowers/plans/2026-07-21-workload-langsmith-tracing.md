# FS-5 워크로드 스코어 LangSmith 트레이싱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ml_workload_score` 파이프라인(Ollama 임베딩 호출 + scikit-learn 이상치 탐지)이 실행될 때마다 LangSmith에 하나의 trace 트리로 자동 기록되도록 계측한다.

**Architecture:** LangChain 없이 `langsmith` SDK의 `@traceable` 데코레이터만으로 함수 단위 계측을 추가한다. `get_workload_score`를 최상위 chain, 그 아래 임베딩 호출(`_embed`)은 llm run, 이상치 탐지 연산(`build_features`/`detect_overload_anomalies_auto`)은 tool run으로 중첩시킨다. `LANGSMITH_API_KEY` 미설정 시 완전 no-op.

**Tech Stack:** Python 3.10, FastAPI, `langsmith==0.10.2`, `python-dotenv`, pytest + pytest-asyncio.

## Global Constraints

- `langsmith==0.10.2`로 버전 고정 (작성자의 `digital_twin` 프로젝트에서 검증된 버전).
- LangChain/LangGraph를 도입하지 않는다 — `requirements.txt`의 "LangChain은 미사용으로 보류" 결정 유지.
- 트레이싱은 `LANGSMITH_API_KEY`가 없으면 완전히 no-op이어야 하며, 기존 회귀 테스트가 수정 없이 그대로 통과해야 한다.
- 환경변수는 `core.config.get_settings()`가 아니라 `workload_db.py`/`embedding_difficulty.py`와 동일한 `dotenv_values() + os.environ` 병합 패턴으로 읽는다.
- 실제 dotenv 파일은 `App/.env` 하나뿐이다. `LANGSMITH_API_KEY`의 실제 값은 사용자가 직접 `App/.env`에 추가한다 — 이 플랜의 어떤 태스크도 실제 키 값을 파일에 쓰지 않는다(비밀값이므로 에이전트가 다루지 않음).
- 범위는 `ml_workload_score` 모듈로 한정 — `contribution_score`, `llm_rag_assistant` 등 다른 모듈은 건드리지 않는다.
- 모든 pytest 명령은 `App/backend_fastapi` 디렉터리에서 실행한다 (`ml_workload_score.app...`, `app.main` 임포트가 이 cwd 기준).
- 참고 설계 문서: `document_이은주/superpowers/specs/2026-07-21-workload-langsmith-tracing-design.md`

---

### Task 1: `langsmith` 의존성 추가 + `setup_langsmith()` 유틸

**Files:**
- Modify: `App/backend_fastapi/requirements.txt`
- Create: `App/backend_fastapi/ml_workload_score/app/services/tracing.py`
- Test: `App/backend_fastapi/tests/ml_workload_score/test_tracing.py`

**Interfaces:**
- Produces: `ml_workload_score.app.services.tracing.setup_langsmith(project_name: str = "workflow-workload-score") -> bool` — `LANGSMITH_API_KEY` 없으면 `False`(no-op), 있으면 `os.environ["LANGSMITH_TRACING"]="true"` + `os.environ["LANGSMITH_PROJECT"]` 세팅 후 `True`.

- [ ] **Step 1: `requirements.txt`에 `langsmith` 추가**

`App/backend_fastapi/requirements.txt`에서 아래 블록을 찾는다:

```
# LLM (6.6, LangChain은 미사용으로 보류)
openai==1.59.7
ollama==0.6.2
```

다음으로 교체한다:

```
# LLM (6.6, LangChain은 미사용으로 보류)
openai==1.59.7
ollama==0.6.2
langsmith==0.10.2
```

- [ ] **Step 2: 가상환경에 설치**

Run: `"C:/AI-projects/work-flow/.venv/Scripts/pip.exe" install langsmith==0.10.2`
Expected: `Successfully installed langsmith-0.10.2 ...` (의존 패키지 포함)

- [ ] **Step 3: 실패하는 테스트 작성**

`App/backend_fastapi/tests/ml_workload_score/test_tracing.py` 새로 작성:

```python
from __future__ import annotations

import os
from unittest.mock import patch

from ml_workload_score.app.services.tracing import setup_langsmith


def test_setup_langsmith_returns_false_without_api_key(monkeypatch):
    monkeypatch.delenv("LANGSMITH_API_KEY", raising=False)
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    with patch(
        "ml_workload_score.app.services.tracing.dotenv_values",
        return_value={},
    ):
        result = setup_langsmith()

    assert result is False
    assert "LANGSMITH_TRACING" not in os.environ


def test_setup_langsmith_enables_tracing_with_default_project(monkeypatch):
    monkeypatch.setenv("LANGSMITH_API_KEY", "test-key")
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    with patch(
        "ml_workload_score.app.services.tracing.dotenv_values",
        return_value={},
    ):
        result = setup_langsmith()

    assert result is True
    assert os.environ["LANGSMITH_TRACING"] == "true"
    assert os.environ["LANGSMITH_PROJECT"] == "workflow-workload-score"


def test_setup_langsmith_respects_custom_project_name(monkeypatch):
    monkeypatch.setenv("LANGSMITH_API_KEY", "test-key")
    monkeypatch.delenv("LANGSMITH_TRACING", raising=False)
    monkeypatch.delenv("LANGSMITH_PROJECT", raising=False)

    with patch(
        "ml_workload_score.app.services.tracing.dotenv_values",
        return_value={},
    ):
        result = setup_langsmith(project_name="custom-project")

    assert result is True
    assert os.environ["LANGSMITH_PROJECT"] == "custom-project"
```

- [ ] **Step 4: 테스트 실패 확인 (모듈이 아직 없음)**

Run: `cd App/backend_fastapi && "../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_tracing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'ml_workload_score.app.services.tracing'`

- [ ] **Step 5: `tracing.py` 구현**

`App/backend_fastapi/ml_workload_score/app/services/tracing.py` 새로 작성:

```python
from __future__ import annotations

import logging
import os

from dotenv import dotenv_values

logger = logging.getLogger(__name__)


def setup_langsmith(project_name: str = "workflow-workload-score") -> bool:
    """
    LangSmith 트레이싱 활성화.

    workload_db.py/embedding_difficulty.py와 동일한 패턴으로 dotenv_values()를 직접
    읽는다 - core.config.get_settings()는 이 dev 환경에서 App/.env를 못 찾아
    ValidationError가 나는 게 확인된 상태라 재사용하지 않는다.

    필요 환경변수:
      LANGSMITH_API_KEY - LangSmith API 키 (smith.langchain.com에서 발급)
      LANGSMITH_PROJECT - 대시보드에 표시될 프로젝트명 (선택, 없으면 project_name 사용)
    """
    env = {**dotenv_values(), **os.environ}
    api_key = env.get("LANGSMITH_API_KEY")

    if not api_key:
        logger.warning(
            "LANGSMITH_API_KEY 미설정 - 워크로드 스코어 트레이싱 비활성화 상태로 진행"
        )
        return False

    os.environ["LANGSMITH_API_KEY"] = api_key
    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGSMITH_PROJECT"] = env.get("LANGSMITH_PROJECT", project_name)
    logger.info("LangSmith 트레이싱 활성화됨 (project=%s)", os.environ["LANGSMITH_PROJECT"])
    return True
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd App/backend_fastapi && "../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_tracing.py -v`
Expected: `3 passed`

- [ ] **Step 7: 커밋**

```bash
git add App/backend_fastapi/requirements.txt App/backend_fastapi/ml_workload_score/app/services/tracing.py App/backend_fastapi/tests/ml_workload_score/test_tracing.py
git commit -m "feat: LangSmith 트레이싱용 setup_langsmith() 유틸 추가"
```

---

### Task 2: `embedding_difficulty.py` 계측 (Ollama 임베딩 = llm run)

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py:1-14` (imports), `:33-45` (`_embed`, `get_anchor_embeddings`), `:94-119` (`compute_embedding_adjustments`)
- Test: `App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty_tracing.py`

**Interfaces:**
- Consumes: 없음 (Task 1과 독립적으로 진행 가능 — `@traceable`은 `langsmith` 패키지에서 바로 import).
- Produces: `_embed`, `get_anchor_embeddings`, `compute_embedding_adjustments`는 시그니처/반환값 동일, `@traceable`로 감싸짐.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty_tracing.py` 새로 작성:

```python
from __future__ import annotations

import inspect
from unittest.mock import AsyncMock, patch

import pytest

from ml_workload_score.app.services import embedding_difficulty as mod


@pytest.mark.asyncio
async def test_embed_still_async_and_returns_embedding_after_traceable():
    assert inspect.iscoroutinefunction(mod._embed)

    fake_client = AsyncMock()
    fake_client.embeddings = AsyncMock(return_value={"embedding": [0.1, 0.2, 0.3]})

    with patch(
        "ml_workload_score.app.services.embedding_difficulty.ollama.AsyncClient",
        return_value=fake_client,
    ):
        result = await mod._embed("테스트 문장")

    assert result == [0.1, 0.2, 0.3]


@pytest.mark.asyncio
async def test_get_anchor_embeddings_still_async_and_caches():
    mod._anchor_cache.clear()
    assert inspect.iscoroutinefunction(mod.get_anchor_embeddings)

    fake_client = AsyncMock()
    fake_client.embeddings = AsyncMock(return_value={"embedding": [1.0]})

    with patch(
        "ml_workload_score.app.services.embedding_difficulty.ollama.AsyncClient",
        return_value=fake_client,
    ):
        hard, easy = await mod.get_anchor_embeddings()

    assert hard == [1.0]
    assert easy == [1.0]


@pytest.mark.asyncio
async def test_compute_embedding_adjustments_empty_task_ids_short_circuits():
    """빈 task_ids는 임베딩/DB 호출 없이 바로 {} 반환해야 한다 (기존 동작, @traceable 이후에도 동일)."""
    result = await mod.compute_embedding_adjustments([], project_id=1)
    assert result == {}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/backend_fastapi && "../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_embedding_difficulty_tracing.py -v`
Expected: 앞의 두 테스트는 `@traceable` 없이도 이미 async/동작이 맞아서 사실 통과할 수 있음 — 그 경우 Step 3에서 데코레이터 추가 후에도 계속 통과하는지가 실제 회귀 확인 포인트. `test_compute_embedding_adjustments_empty_task_ids_short_circuits`도 기존 코드로 이미 통과함. (이 태스크는 "동작 불변 보장"이 목적이라 테스트가 데코레이터 적용 전후 모두 통과하는 게 정상 — Step 4에서 반드시 재실행해 회귀 없음을 재확인한다.)

- [ ] **Step 3: `embedding_difficulty.py`에 `@traceable` 추가**

`App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py` 상단 import 블록(1~13번째 줄)을:

```python
from __future__ import annotations

import asyncio
import logging
import os

import ollama
from dotenv import dotenv_values
from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine
from llm_rag_assistant.app.services.vector_utils import to_vector_literal
```

다음으로 교체(`from langsmith import traceable` 한 줄 추가):

```python
from __future__ import annotations

import asyncio
import logging
import os

import ollama
from dotenv import dotenv_values
from langsmith import traceable
from sqlalchemy import text

from ml_workload_score.app.services.workload_db import get_engine
from llm_rag_assistant.app.services.vector_utils import to_vector_literal
```

`_embed` 함수(현재):

```python
async def _embed(text_value: str) -> list[float]:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.embeddings(model=EMBEDDING_MODEL, prompt=text_value)
    return response["embedding"]
```

다음으로 교체:

```python
@traceable(run_type="llm", name="ollama_embed")
async def _embed(text_value: str) -> list[float]:
    client = ollama.AsyncClient(host=OLLAMA_HOST)
    response = await client.embeddings(model=EMBEDDING_MODEL, prompt=text_value)
    return response["embedding"]
```

`get_anchor_embeddings` 함수(현재):

```python
async def get_anchor_embeddings() -> tuple[list[float], list[float]]:
    """HARD/EASY 앵커 임베딩을 프로세스당 한 번만 계산해 캐싱한다."""
```

다음으로 교체(데코레이터 한 줄 추가):

```python
@traceable(run_type="chain", name="get_anchor_embeddings")
async def get_anchor_embeddings() -> tuple[list[float], list[float]]:
    """HARD/EASY 앵커 임베딩을 프로세스당 한 번만 계산해 캐싱한다."""
```

`compute_embedding_adjustments` 함수(현재):

```python
async def compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]:
```

다음으로 교체:

```python
@traceable(run_type="chain", name="compute_embedding_adjustments")
async def compute_embedding_adjustments(task_ids: list[int], project_id: int) -> dict[int, float]:
```

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run:
```bash
cd App/backend_fastapi
"../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_embedding_difficulty_tracing.py tests/ml_workload_score/test_workload_model_embedding.py tests/ml_workload_score/test_workload_service.py -v
```
Expected: 전부 `passed` (기존 `test_workload_model_embedding.py`/`test_workload_service.py`가 `@traceable` 추가 후에도 수정 없이 그대로 통과해야 함).

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py App/backend_fastapi/tests/ml_workload_score/test_embedding_difficulty_tracing.py
git commit -m "feat: 임베딩 난이도 보정 파이프라인에 LangSmith 트레이싱 추가"
```

---

### Task 3: `workload_model.py` 계측 (sklearn 이상치 탐지 = tool run)

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/services/workload_model.py:12-15` (imports), `:184` (`build_features` 정의부), `:295` (`detect_overload_anomalies_auto` 정의부)
- Test: `App/backend_fastapi/tests/ml_workload_score/test_workload_model_tracing.py`

**Interfaces:**
- Consumes: 없음.
- Produces: `build_features`, `detect_overload_anomalies_auto`는 시그니처/반환값 동일, `@traceable(run_type="tool")`로 감싸짐. `__name__`은 `functools.wraps`에 의해 원본 이름 그대로 유지(LangSmith 대시보드에 함수명이 그대로 표시되게 하기 위한 확인 포인트).

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/ml_workload_score/test_workload_model_tracing.py` 새로 작성:

```python
from __future__ import annotations

from ml_workload_score.app.services.workload_model import (
    build_features,
    detect_overload_anomalies_auto,
)


def test_build_features_name_preserved_after_traceable():
    assert build_features.__name__ == "build_features"


def test_detect_overload_anomalies_auto_name_preserved_after_traceable():
    assert detect_overload_anomalies_auto.__name__ == "detect_overload_anomalies_auto"
```

- [ ] **Step 2: 테스트 실행 (아직은 통과함 - 데코레이터 적용 전이라 `__name__`이 원래부터 맞음)**

Run: `cd App/backend_fastapi && "../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_workload_model_tracing.py -v`
Expected: `2 passed` (데코레이터 적용 전에도 통과 — 이 테스트의 진짜 목적은 Step 4에서 데코레이터 적용 후에도 여전히 통과하는지 확인하는 것).

- [ ] **Step 3: `workload_model.py`에 `@traceable` 추가**

`App/backend_fastapi/ml_workload_score/app/services/workload_model.py`의 import 블록(12~15번째 줄, 현재):

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
```

다음으로 교체:

```python
import numpy as np
import pandas as pd
from langsmith import traceable
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
```

`build_features` 정의(184번째 줄, 현재):

```python
def build_features(
    tasks_df: pd.DataFrame,
    today: pd.Timestamp = None,
    embedding_adjustments: dict[int, float] | None = None,
) -> pd.DataFrame:
```

다음으로 교체:

```python
@traceable(run_type="tool", name="build_features")
def build_features(
    tasks_df: pd.DataFrame,
    today: pd.Timestamp = None,
    embedding_adjustments: dict[int, float] | None = None,
) -> pd.DataFrame:
```

`detect_overload_anomalies_auto` 정의(295번째 줄, 현재):

```python
def detect_overload_anomalies_auto(feature_df: pd.DataFrame, small_team_threshold: int = 15) -> pd.DataFrame:
```

다음으로 교체:

```python
@traceable(run_type="tool", name="detect_overload_anomalies_auto")
def detect_overload_anomalies_auto(feature_df: pd.DataFrame, small_team_threshold: int = 15) -> pd.DataFrame:
```

- [ ] **Step 4: 테스트 통과 + 회귀 확인**

Run:
```bash
cd App/backend_fastapi
"../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_workload_model_tracing.py tests/ml_workload_score/test_workload_model_embedding.py -v
```
Expected: 전부 `passed`.

- [ ] **Step 5: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/workload_model.py App/backend_fastapi/tests/ml_workload_score/test_workload_model_tracing.py
git commit -m "feat: 이상치 탐지(MAD/IsolationForest)에 LangSmith tool 트레이싱 추가"
```

---

### Task 4: `workload_service.py` 계측 (최상위 chain) + 라우터에서 `setup_langsmith()` 호출

**Files:**
- Modify: `App/backend_fastapi/ml_workload_score/app/services/workload_service.py:1-21` (imports + 함수 정의부)
- Modify: `App/backend_fastapi/ml_workload_score/app/routers/workload_router.py:1-13` (imports + 모듈 로드 시점 호출)
- Test: 기존 `App/backend_fastapi/tests/ml_workload_score/test_workload_service.py`, `test_workload_router.py` 재사용(회귀), 신규 assertion 추가

**Interfaces:**
- Consumes: Task 1의 `setup_langsmith`, Task 2/3에서 이미 계측된 하위 함수들.
- Produces: `get_workload_score`가 `@traceable(run_type="chain", name="get_workload_score")`로 감싸짐. 라우터 모듈 로드 시 `setup_langsmith()` 1회 호출.

- [ ] **Step 1: 실패하는 테스트 추가**

`App/backend_fastapi/tests/ml_workload_score/test_workload_service.py` 맨 아래에 추가:

```python
def test_get_workload_score_name_preserved_after_traceable():
    from ml_workload_score.app.services.workload_service import get_workload_score
    assert get_workload_score.__name__ == "get_workload_score"
```

- [ ] **Step 2: 테스트 실행 (통과함 - 데코레이터 적용 전이라 원래부터 맞음, Step 5에서 진짜 검증)**

Run: `cd App/backend_fastapi && "../../.venv/Scripts/pytest.exe" tests/ml_workload_score/test_workload_service.py -v`
Expected: 전부 `passed` (기존 3개 + 신규 1개 = 4 passed).

- [ ] **Step 3: `workload_service.py`에 `@traceable` 추가**

`App/backend_fastapi/ml_workload_score/app/services/workload_service.py`의 import 블록(1~16번째 줄, 현재):

```python
from __future__ import annotations

import asyncio
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
```

다음으로 교체:

```python
from __future__ import annotations

import asyncio
import logging

from langsmith import traceable

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
```

`get_workload_score` 정의(21번째 줄, 현재):

```python
async def get_workload_score(project_id: int, use_synthetic_fallback: bool = False) -> WorkloadScoreData:
```

다음으로 교체:

```python
@traceable(run_type="chain", name="get_workload_score")
async def get_workload_score(project_id: int, use_synthetic_fallback: bool = False) -> WorkloadScoreData:
```

- [ ] **Step 4: `workload_router.py`에서 `setup_langsmith()` 호출**

`App/backend_fastapi/ml_workload_score/app/routers/workload_router.py` 전체(현재):

```python
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ml_workload_score.app.schema.workload_schema import WorkloadScoreResponse
from ml_workload_score.app.services.workload_service import get_workload_score

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/score", tags=["workload"])
```

다음으로 교체(뒤 `score_workload` 함수는 그대로 유지):

```python
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from ml_workload_score.app.schema.workload_schema import WorkloadScoreResponse
from ml_workload_score.app.services.tracing import setup_langsmith
from ml_workload_score.app.services.workload_service import get_workload_score

logger = logging.getLogger(__name__)

setup_langsmith()

router = APIRouter(prefix="/ai/score", tags=["workload"])
```

- [ ] **Step 5: 회귀 테스트 실행**

Run:
```bash
cd App/backend_fastapi
"../../.venv/Scripts/pytest.exe" tests/ml_workload_score/ -v
```
Expected: 디렉터리 내 전체 테스트(`test_tracing.py`, `test_embedding_difficulty_tracing.py`, `test_workload_model_tracing.py`, `test_workload_model_embedding.py`, `test_workload_service.py`, `test_workload_router.py`) 전부 `passed`. 이 리포지토리엔 `LANGSMITH_API_KEY`가 CI/테스트 환경변수로 주입되지 않으므로 `setup_langsmith()`는 매 테스트 실행 시 `False`를 반환하며 `@traceable`은 no-op으로 동작 — 기존 회귀 테스트 결과가 조금도 달라지지 않아야 한다.

- [ ] **Step 6: 커밋**

```bash
git add App/backend_fastapi/ml_workload_score/app/services/workload_service.py App/backend_fastapi/ml_workload_score/app/routers/workload_router.py App/backend_fastapi/tests/ml_workload_score/test_workload_service.py
git commit -m "feat: 워크로드 스코어 서비스 전체를 LangSmith 최상위 chain으로 계측"
```

---

### Task 5: 로컬 활성화 (수동 단계, 코드 변경 없음)

**Files:** 없음 (사용자가 로컬 `App/.env`에 직접 값 추가 — 비밀값이라 에이전트가 대신 쓰지 않음)

- [ ] **Step 1: 사용자가 `App/.env`에 아래 두 줄 추가**

```
LANGSMITH_API_KEY=<실제 발급받은 키>
LANGSMITH_PROJECT=workflow-workload-score
```

(`LANGSMITH_PROJECT`는 생략 가능 — 생략하면 코드 기본값 `workflow-workload-score`가 쓰인다.)

- [ ] **Step 2: 로컬에서 FastAPI 서버 기동 후 수동 확인**

```bash
cd App/backend_fastapi
"../../.venv/Scripts/uvicorn.exe" app.main:app --reload
```

다른 터미널에서:

```bash
curl -X POST "http://localhost:8000/ai/score/workload?project_id=1&use_synthetic_fallback=true"
```

기동 로그에 `LangSmith 트레이싱 활성화됨 (project=workflow-workload-score)`가 찍히는지, https://smith.langchain.com 대시보드의 `workflow-workload-score` 프로젝트에 `get_workload_score` trace(하위에 `build_features`, `detect_overload_anomalies_auto`, `use_synthetic_fallback=true`라 임베딩 단계는 스킵될 수 있음 — DB 경로로 확인하려면 `use_synthetic_fallback=false`와 실제 프로젝트로 재시도)가 나타나는지 눈으로 확인한다.

이 단계는 유닛 테스트로 자동화하지 않는다(외부 서비스 의존 — 설계 문서의 "테스트 계획" 섹션 참고).

---

## Self-Review 결과

- **스펙 커버리지**: 설계 문서의 아키텍처 섹션(trace 트리 5개 함수)은 Task 1~4에서 전부 계측됨. 환경변수/에러 처리 섹션은 Task 1의 `setup_langsmith()` + 각 태스크의 회귀 테스트로 커버됨. `.env` 추가는 Task 5(수동)로 반영. `.env.example` 문서화는 설계 문서의 non-goal대로 이 플랜에 포함하지 않음.
- **플레이스홀더 스캔**: "TBD"/"나중에 구현" 등 없음. 모든 스텝에 실행 가능한 실제 코드/명령이 포함됨.
- **타입/시그니처 일관성**: `setup_langsmith(project_name: str = "workflow-workload-score") -> bool`이 Task 1~4에서 동일하게 사용됨. `@traceable`의 `run_type`은 설계 문서의 트리 다이어그램과 정확히 일치(`_embed`=llm, `get_anchor_embeddings`/`compute_embedding_adjustments`/`get_workload_score`=chain, `build_features`/`detect_overload_anomalies_auto`=tool).
