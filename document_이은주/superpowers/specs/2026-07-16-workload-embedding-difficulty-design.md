# FS-5 워크로드 스코어 — 임베딩 기반 난이도 피처 통합 설계

작성일: 2026-07-16
작성자: 이은주 (FS-5 ML/AI 모델링)
관련: `document_이은주/2026-07-16-workload-real-data-validation.md` 6장(다음 단계)

## 배경 / 목적

`workload_model.py`의 업무 난이도(`difficulty_of()`)는 지금까지 `priority`(낮음/중간/높음)와
`category`(18종) 두 범주형 값의 가중치 합으로만 근사됐다. 같은 카테고리·우선순위라도 실제
업무 난이도는 다를 수 있는데, 이 두 값만으로는 그 차이를 구분하지 못한다.

로드맵의 "실제 라벨 축적 후 self-labeling → 지도학습 전환 검토" 항목을 시도하려 했으나,
Supabase 실측 확인 결과 `evaluation_scores`/`contribution_reports`/`audit_logs` 전부 0건 —
지도학습으로 전환할 실제 라벨이 아직 없다. 반면 FS-4(고무서)의 RAG 임베딩 파이프라인은
이미 실제 데이터로 동작 중이다(`document_chunks`에 `source_type='task'` 16건 포함, pgvector
정상 설치·populate됨).

그래서 라벨이 쌓이길 기다리는 대신, **지금 바로 적용 가능한 무라벨(unsupervised) 개선**으로
임베딩을 난이도 피처에 통합한다. 지도학습 전환 자체는 실제 라벨이 쌓인 뒤 별도로 재검토한다
(이번 스코프 아님).

## 접근법: 기준점(anchor) 문장 코사인 유사도

"고난이도" 대 "단순 업무"를 대표하는 두 문장을 임베딩해두고, 각 업무의 임베딩과의 코사인
유사도 차이를 난이도 보정치로 쓴다. 라벨이 필요 없고, 계산이 가볍고, 결과를 사람이 해석하기
쉽다(어떤 앵커에 더 가까운지 설명 가능). 대안으로 검토했던 임베딩 클러스터링(k-means)이나
이상치(novelty) 점수는 현재 임베딩된 업무가 16건뿐이라 통계적으로 불안정하고(4장에서 이미
Isolation Forest가 소표본에서 실패한 것과 같은 문제), "다름"과 "어려움"을 개념적으로 동일시하는
약점이 있어 기각했다.

## 아키텍처

새 모듈 `App/backend_fastapi/ml_workload_score/app/services/embedding_difficulty.py`를
추가한다. `workload_model.py`는 지금처럼 순수 오프라인 계산(입출력 없음)으로 유지하고,
이 새 모듈이 Ollama 호출·`document_chunks` 조회라는 두 I/O 의존성을 전담한다.

```
workload_service.get_workload_score()
  └─ db.load_tasks_from_db()                         # 기존
  └─ embedding_difficulty.compute_embedding_adjustments(task_ids, project_id)  # 신규
  └─ build_features(tasks_df, embedding_adjustments=...)  # 기존 함수에 옵션 인자 추가
       └─ difficulty_of(priority, category) + embedding_adjustments.get(task_id, 0.0)
```

### `embedding_difficulty.py`

```python
HARD_ANCHOR = "복잡하고 어려운 고난이도 기술 업무. 설계와 문제 해결이 까다롭고 전문성이 필요하다."
EASY_ANCHOR = "단순하고 쉬운 반복 업무. 절차가 명확하고 빠르게 처리할 수 있다."
EMBEDDING_DIFFICULTY_WEIGHT = 0.3  # CATEGORY_WEIGHT(±0.5) 대비 약간 보수적인 스케일

_anchor_cache: dict[str, list[float]] = {}  # 모듈 전역 캐시, 프로세스당 1회만 임베딩 호출

async def get_anchor_embeddings() -> tuple[list[float], list[float]]:
    """HARD/EASY 앵커 임베딩을 캐싱해서 반환. 최초 1회만 임베딩 호출."""

async def compute_embedding_adjustments(
    task_ids: list[int], project_id: int
) -> dict[int, float]:
    """
    document_chunks에서 source_type='task'인 기존 임베딩만 재사용한다(새로 임베딩 호출 안 함 —
    그건 FS-4 파이프라인의 책임). 임베딩이 없는 task_id는 결과 dict에서 아예 빠지고,
    build_features()에서 .get(task_id, 0.0)으로 처리돼 오늘과 동일하게 동작한다.
    """
```

**구현 세부사항(설계 검토 중 실제 환경 확인 후 확정)**:

- **Ollama 호출은 FS-4의 `embedding_service.embed_text()`를 그대로 재사용하지 않는다.**
  이유: `embed_text()`는 내부에서 `core.config.get_settings()`를 호출하는데, 실제로 확인해보니
  이 dev 환경(cwd=`App/backend_fastapi`)에서 `core/config.py`의 `SettingsConfigDict(env_file=".env")`가
  `App/.env`를 못 찾아 `ValidationError`가 난다(pydantic-settings는 `workload_db.py`의
  `dotenv_values()`와 달리 상위 디렉터리를 탐색하지 않음 — Docker 배포 시엔 docker-compose가
  실제 OS 환경변수로 주입해주니 문제없지만, 이 로컬 dev 환경에선 재현되는 실제 버그다).
  이건 FS-4/공통 설정(`core/config.py`) 소관이라 이번 스코프에서 고치지 않고, 대신
  `embedding_difficulty.py`가 `workload_db.py`와 동일한 패턴(`dotenv_values()`)으로
  `OLLAMA_HOST`/`EMBEDDING_MODEL`을 직접 읽어 `ollama.AsyncClient`를 자체적으로 호출한다
  (3~4줄 정도의 작은 중복이지만, 이미 검증된 설정 로딩 경로에 의존하는 게 더 안전함).
- **DB 조회는 asyncpg(`core.db.get_pool()`)가 아니라 `workload_db.get_engine()`(SQLAlchemy)을
  재사용한다.** 같은 이유로 `core.db.get_pool()`도 내부적으로 `core.config.get_settings()`를
  거치므로 이 dev 환경에서 동작하지 않는다. `workload_db.get_engine()`은 이미 이번 재검증
  세션에서 pool_size=1+dispose()로 안정화된 상태라 그대로 재사용한다. 코사인 유사도는 pgvector의
  `<=>` 연산자로 SQL에서 직접 계산(Python으로 원본 벡터를 끌어와 재계산하지 않음):

  ```sql
  SELECT source_id,
         1 - (embedding <=> :hard_anchor ::vector) AS sim_hard,
         1 - (embedding <=> :easy_anchor ::vector) AS sim_easy
  FROM document_chunks
  WHERE project_id = :project_id
    AND source_type = 'task'
    AND source_id = ANY(:task_ids)
  ```
  (`<=>`는 코사인 거리이므로 `1 - 거리` = 코사인 유사도). 앵커 벡터는 `llm_rag_assistant.app.services.vector_utils.to_vector_literal()`로 문자열 변환해서 바인딩한다(이 유틸은 설정 의존성이 없는 순수 함수라 그대로 재사용 — FS-4 코드와의 유일한 연결점).
  한 번의 쿼리로 태스크마다 `sim_hard - sim_easy`를 계산해
  `embedding_adjustments[source_id] = (sim_hard - sim_easy) * EMBEDDING_DIFFICULTY_WEIGHT`로 채운다.
- **DB 커넥션이 SQLAlchemy(동기)라 `compute_embedding_adjustments()`에서 실제 블로킹 호출은
  `await`가 아니라 그냥 동기 실행이다** — `load_tasks_from_db()`도 이미 같은 방식으로 동작 중이라
  일관됨. `async def`인 이유는 오직 앵커 임베딩(Ollama) 호출 때문이다.

### `workload_model.py` 변경

```python
def build_features(
    tasks_df: pd.DataFrame,
    today: pd.Timestamp = None,
    embedding_adjustments: dict[int, float] | None = None,
) -> pd.DataFrame:
    ...
    df["difficulty"] = df.apply(
        lambda r: difficulty_of(r["priority"], r["category"])
        + (embedding_adjustments.get(r["task_id"], 0.0) if embedding_adjustments else 0.0),
        axis=1,
    )
```

`difficulty_of()` 자체는 건드리지 않는다 — 합성 데이터·Jira 어댑터는 `embedding_adjustments`
없이 호출되므로 오늘과 완전히 동일하게 동작(회귀 없음).

### 비동기 경계

앵커 임베딩(Ollama, `ollama.AsyncClient`)만 진짜 비동기 I/O라서 `get_workload_score()`와
`workload_router.score_workload()`를 `async def`로 바꾼다(`llm_rag_assistant`의 `chat_router.py`가
이미 이 패턴 — 라우터에 `async def` 핸들러). `document_chunks` 조회·`load_tasks_from_db()`는
SQLAlchemy 동기 호출이라 그 안에서는 그냥 일반 함수 호출이다. `asyncio.run()`을 동기 함수 안에
억지로 넣는 방식은 쓰지 않는다.

## 에러 처리

Ollama 연결 실패·타임아웃 시 앵커 임베딩을 못 구하면 **전체 `embedding_adjustments`를 빈
딕셔너리로 처리**하고 로그만 남긴다 — 워크로드 스코어 자체는 임베딩 없이도 항상 계산 가능해야
하므로(오늘까지의 동작), 이 보강 신호 하나 때문에 엔드포인트 전체가 500을 내면 안 된다.
(주의: 이건 `ai.md` 컨벤션의 "LLM 실패 시 명시적 에러" 원칙과는 다른 케이스다 — 이건 필수
입력이 아니라 선택적 보강 신호이기 때문.)

## 테스트

- `embedding_difficulty.compute_embedding_adjustments()` 단위 테스트: `embed_text`와
  `document_chunks` 쿼리를 모킹해서 코사인 유사도 계산·빈 결과 처리 확인
- `build_features()`에 `embedding_adjustments` 전달 시 난이도가 실제로 바뀌는지, 전달 안 하면
  기존과 동일한지 회귀 테스트
- 기존 `tests/ml_workload_score/test_workload_router.py`를 async 엔드포인트에 맞게 갱신

## 스코프 밖

- 지도학습 전환(실제 라벨 축적 후 재검토 — 이번 작업과 별개)
- 임베딩이 없는 업무를 위한 실시간 임베딩 생성 호출(FS-4 파이프라인 책임 영역)
- 앵커 문장 다변화/다중 앵커 앙상블(추후 필요시 검토)
