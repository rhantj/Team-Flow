# FS-5 워크로드 스코어 — LangSmith 트레이싱 통합 설계

작성일: 2026-07-21
작성자: 이은주 (FS-5 ML/AI 모델링)
관련: [[2026-07-16-workload-embedding-difficulty-design]] (`embedding_difficulty.py`), `workload_model.py`, `workload_service.py`

## 배경 / 목적

`get_workload_score()` 파이프라인은 두 종류의 모델 연산을 거친다 — (1) Ollama 임베딩 호출
(`embedding_difficulty.py`, 난이도 보정치 계산용), (2) scikit-learn 기반 이상치 탐지
(`workload_model.py`의 MAD/IsolationForest). 지금은 이 둘 중 어느 단계에서 시간이 걸리는지,
임베딩 응답이 실제로 어떤 값이었는지, 이상치 탐지에 어떤 피처가 들어갔는지를 사후에 확인할
방법이 없다 — 로그만으로는 파이프라인 관찰성이 부족하다.

작성자가 이전 프로젝트(`digital_twin`)에서 LangGraph + LangSmith로 이 문제를 해결한 경험이
있어 같은 방식을 이식한다. 다만 `digital_twin`은 LangGraph/LangChain을 쓰기 때문에 환경변수만
켜면 프레임워크가 자동으로 모든 노드/Tool/LLM 호출을 계측했던 것과 달리, 이 프로젝트는
LangChain을 쓰지 않는 raw `ollama` + `scikit-learn` 파이프라인이라 자동 계측이 되지 않는다.
`langsmith` SDK의 `@traceable` 데코레이터는 LangChain 없이도 독립적으로 동작하므로, 이걸로
필요한 함수에만 수동으로 계측 지점을 표시한다.

`requirements.txt`의 "LLM (LangChain은 미사용으로 보류)" 결정과는 충돌하지 않는다 —
`langsmith` 패키지는 `langchain` 패키지와 별개이고, LangChain을 도입하지 않는다.

## Goals

- `get_workload_score()` 실행 1회 = LangSmith 대시보드의 trace 1건으로 보이도록 계측한다.
- 임베딩 호출(`_embed`)은 LLM run으로, 이상치 탐지 연산(`build_features`,
  `detect_overload_anomalies_auto`)은 tool run으로 구분해서 하나의 trace 트리 안에 중첩시킨다.
- `LANGSMITH_API_KEY`가 없는 환경(테스트, 로컬 미설정 등)에서는 트레이싱이 완전히 no-op으로
  동작해 기존 동작에 아무 영향이 없어야 한다.

## Non-goals

- LangChain/LangGraph 도입 — 하지 않는다 (결정된 정책 유지).
- LangSmith `evaluate()` 기반 정량 평가 데이터셋 구축 — 이번 스코프 아님(트레이싱만).
- `contribution_score`, `llm_rag_assistant` 등 다른 FS 소유 모듈에 대한 트레이싱 — `ml_workload_score`
  범위로 한정한다.
- 팀 공유용 `.env.example` 문서화 — 아직 팀에 공유할 단계가 아니므로 이번 스코프에서는 하지 않는다
  (로컬 `App/.env`에만 실제 키를 추가).

## 아키텍처

```
ml_workload_score/app/services/tracing.py   (신규)
  setup_langsmith(project_name: str = "workflow-workload-score") -> bool
    - dotenv_values() + os.environ 병합 패턴(workload_db.py/embedding_difficulty.py와 동일)으로
      LANGSMITH_API_KEY, LANGSMITH_PROJECT를 읽음 (core.config.get_settings()는 이 dev 환경에서
      깨지는 게 이미 확인된 상태라 재사용하지 않음 — embedding_difficulty.py와 같은 이유)
    - LANGSMITH_API_KEY 없으면 로그 경고 후 False 반환, os.environ 변경 없음
    - 있으면 os.environ["LANGSMITH_TRACING"]="true", os.environ.setdefault("LANGSMITH_PROJECT", ...)
      세팅 후 True 반환
    - digital_twin/src/observability.py의 setup_langsmith()와 동일한 형태(참고용으로 이미 검증된 패턴)

workload_router.py 모듈 로드 시점(FastAPI 라우터 임포트 시 1회) setup_langsmith() 호출
        │
        ▼
workload_service.get_workload_score()                      @traceable(run_type="chain")
  ├─ embedding_difficulty.compute_embedding_adjustments()   @traceable(run_type="chain")
  │    └─ get_anchor_embeddings()                            @traceable(run_type="chain")
  │         └─ _embed()                                      @traceable(run_type="llm")
  ├─ workload_model.build_features()                         @traceable(run_type="tool")
  └─ workload_model.detect_overload_anomalies_auto()         @traceable(run_type="tool")
```

- `_embed()`만 `run_type="llm"` — LangSmith가 프롬프트(앵커 문장)/응답(임베딩 벡터)·지연시간을
  LLM 포맷으로 표시.
- `build_features`/`detect_overload_anomalies_auto`는 `run_type="tool"` — 입력 DataFrame
  요약(행 수, 컬럼)과 출력(이상치 개수, 상위 점수) 정도만 기록. 임베딩 벡터 원본처럼 큰 배열을
  그대로 trace에 넣지 않는다(대시보드 payload 비대화 방지 — 반환값의 요약 통계만 traceable
  metadata로 남긴다).
- `detect_overload_anomalies_robust`(MAD)/`detect_overload_anomalies`(IsolationForest) 내부
  세부 단계는 별도 데코레이터 없이 부모(`detect_overload_anomalies_auto`)의 입출력 기록으로 충분.

## 환경변수

- 실제 dotenv 파일은 `App/.env` 하나뿐이다 (`App/backend_fastapi/.env`는 없고 `.env.example`만
  템플릿으로 존재). `dotenv_values()`를 인자 없이 호출하면 호출부 파일 위치 기준으로 상위
  디렉터리를 탐색해 `.env`를 찾으므로(`find_dotenv()` 동작), `ml_workload_score` 코드가 어디서
  실행되든 `App/.env`를 찾아낸다.
- `App/.env`에 아래 추가(로컬 전용, 이번 스코프에서는 `.env.example` 문서화 안 함):
  ```
  LANGSMITH_API_KEY=<실제 키>
  LANGSMITH_PROJECT=workflow-workload-score   # 선택, 없으면 코드 기본값 사용
  ```

## 의존성

- `requirements.txt`(`App/backend_fastapi/requirements.txt`)의 "LLM" 섹션에 `langsmith==0.10.2`
  추가 — 작성자의 `digital_twin` 프로젝트에서 이미 검증되어 동작 중인 버전으로 고정한다.

## 에러 처리

- `setup_langsmith()`는 앱 시작 시 예외를 던지지 않는다 — 키 없으면 경고 로그 후 `False` 반환.
- `@traceable`은 감싼 함수의 정상 동작을 그대로 통과시키는 투명한 래퍼다. trace 전송은 SDK
  내부 백그라운드 큐로 비동기 처리되므로, LangSmith API 장애/네트워크 단절이 있어도
  `get_workload_score()`의 실제 응답/예외 흐름에는 영향이 없다(SDK가 전송 실패를 자체적으로
  로그만 남기고 삼킴).
- 기존 `embedding_difficulty.py`의 "Ollama 실패 시 빈 dict로 조용히 진행" try/except는 그대로
  유지한다. `@traceable`을 씌워도 예외가 잡히는 지점·반환값은 변하지 않고, 그 예외가 발생했다는
  사실이 LangSmith에 실패한 run으로 추가 기록될 뿐이다.
- 이 원칙은 기존 "보강 신호 실패해도 본 기능은 살아있어야 한다" 철학과 동일선상 — 트레이싱은
  관찰만 하고 절대 실제 동작에 관여하지 않는다.

## 테스트 계획

- `tests/ml_workload_score/test_tracing.py`(신규): `setup_langsmith()` 단위 테스트
  - `LANGSMITH_API_KEY` 미설정 시 `False` 반환 + `LANGSMITH_TRACING` 환경변수가 세팅되지 않음을
    확인 (monkeypatch로 `os.environ` 격리).
  - 설정 시 `True` 반환 + `os.environ["LANGSMITH_TRACING"] == "true"`, `LANGSMITH_PROJECT`
    기본값/커스텀값 확인.
- 회귀 확인: 기존 `test_workload_model_embedding.py` / `test_workload_service.py` /
  `test_workload_router.py`는 **수정 없이 그대로 통과**해야 한다 — 테스트 환경엔
  `LANGSMITH_API_KEY`가 없어 `@traceable`이 자동 no-op이 되기 때문.
- async 호환 스모크 테스트: `_embed`/`get_anchor_embeddings`/`compute_embedding_adjustments`/
  `get_workload_score`가 전부 async 함수인데, `@traceable`을 씌운 뒤에도 여전히 `await` 가능하고
  반환값이 동일한지 확인.
- LangSmith 서버로 실제 trace가 전송되는지 자체는 유닛 테스트 범위 밖(외부 서비스 의존) — 로컬에서
  실제 `LANGSMITH_API_KEY`로 한 번 실행해 대시보드에서 수동 확인.

## 알려진 한계

- 트레이싱은 프로세스 시작 시점에 `LANGSMITH_API_KEY` 유무로 켜고 끄는 정적 스위치다 —
  런타임 중 토글(예: 특정 요청만 트레이싱)은 이번 스코프에 포함하지 않는다.
- `build_features`/`detect_overload_anomalies_auto`에 기록하는 입출력은 요약 통계뿐이라, 개별
  업무 단위의 원본 데이터까지 LangSmith에서 들여다볼 수는 없다(필요해지면 별도로 확장).
