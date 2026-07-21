# RAG 챗봇 LangChain 전환 + LangSmith 연동

날짜: 2026-07-21

## 배경

`App/backend_fastapi/llm_rag_assistant/`의 RAG 챗봇(답변 생성 + 문서 임베딩)은 최근
Ollama에서 HuggingFace로 전환됐다(`generation_service.py`는 httpx로 HF Router Chat
Completions를, `embedding_service.py`는 `huggingface_hub.InferenceClient`로 bge-m3
임베딩을 직접 호출). 여기에 LangSmith 관찰가능성(observability)을 연동하고 싶다.

LangSmith는 LangChain 없이도 독립 SDK(`@traceable`)로 쓸 수 있지만, 이번 작업은
LangChain으로 먼저 전환한 뒤 LangSmith와 네이티브로 연동하는 방향으로 진행하기로
결정했다(사용자 확인 완료). `docs/projects/WorkFlow_AI_기술_스택_버전.md` §6.6에는
LangChain이 "선택, 미설치(코드에서 아직 미사용)"로 명시되어 있었다 — 이번이 첫 도입이다.

## 범위

**포함**: `llm_rag_assistant` 모듈만 — `generation_service.py`, `embedding_service.py`,
`chat_router.py`, 관련 테스트, `requirements.txt`, `app/main.py`(전역 `load_dotenv()` 추가),
`.env`/`.env.example`.

**제외**: `ai_contribution_report`, `ml_workload_score/embedding_difficulty.py`,
`app/main.py`의 회의록 분석(HF 직접 호출 유지) — 전부 out of scope.

## 사전 조사 결과

- `langchain-core`, `langchain-huggingface`, `langsmith` 패키지 모두 현재 미설치.
- `core/config.py`의 `pydantic-settings`는 `env_file=".env"`로 **자기 클래스 필드만** 채우고
  `os.environ`에는 반영하지 않는다. LangSmith SDK는 내부적으로 `os.getenv("LANGSMITH_API_KEY")`
  등을 직접 읽으므로, 전역 `load_dotenv()` 호출이 없으면 `.env`에 키를 넣어도 인식되지 않는다.
  `python-dotenv`는 이미 `requirements.txt`에 있다(버전 1.0.1).
- 현재 `embedding_service.py`(Task 2에서 HF로 전환됨)가 쓰는 `huggingface_hub.InferenceClient`는
  내부적으로 `requests` 기반이라 실패 시 `huggingface_hub.errors.HfHubHTTPError` 등을 던진다.
  하지만 `chat_router.py`는 지금 `httpx.*` 예외만 잡고 있어서, **임베딩 쪽 HF 오류는 현재도
  503으로 변환되지 않는 사각지대가 있다.** 이번 작업에서 함께 고쳐야 한다.

## 변경 사항

### 1. 의존성 (`requirements.txt`)

`langchain-core`, `langchain-huggingface`, `langsmith` 추가. 정확한 버전은 구현 단계에서
현재 설치된 `huggingface_hub==0.36.2`, `pydantic` 버전과의 호환성을 확인 후 고정한다.

### 2. `app/main.py`

파일 최상단(다른 import보다 먼저)에 추가:

```python
from dotenv import load_dotenv

load_dotenv()
```

`.env`의 `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`가 프로세스
환경변수로 로드되어야 LangChain의 자동 트레이싱이 동작한다.

### 3. `embedding_service.py`

```python
from langchain_huggingface import HuggingFaceEndpointEmbeddings
```

`huggingface_hub.InferenceClient.feature_extraction` 직접 호출을 제거하고
`HuggingFaceEndpointEmbeddings(model=settings.hf_embedding_model, huggingfacehub_api_token=settings.hf_token).embed_query(text)`로
대체한다. 동기 API이므로 기존과 동일하게 `asyncio.to_thread`로 감싼다. 함수 시그니처
`embed_text(text: str) -> list[float]`는 그대로 유지.

### 4. `generation_service.py`

```python
from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint
from langchain_core.messages import HumanMessage, SystemMessage
```

httpx 직접 호출 대신:

```python
llm = HuggingFaceEndpoint(
    repo_id=settings.hf_rag_generation_model,
    task="conversational",
    huggingfacehub_api_token=settings.hf_token,
)
chat_model = ChatHuggingFace(llm=llm)
response = await chat_model.ainvoke([
    SystemMessage(content=_SYSTEM_PROMPT),
    HumanMessage(content=f"컨텍스트:\n{context}\n\n질문: {question}"),
])
return response.content
```

`ainvoke`는 LangChain 러너블의 네이티브 async 경로라 기존처럼 `asyncio.to_thread`가
필요 없다. 함수 시그니처 `generate_answer(question: str, sources: list[dict]) -> str`는
그대로 유지. `HF_TOKEN` 누락 가드(현재 있는 `RuntimeError` 체크)는 유지한다.

### 5. `chat_router.py`

예외 처리 타입을 `httpx.*`에서 실제로 발생 가능한 타입으로 교체:

```python
from huggingface_hub.errors import HfHubHTTPError
from requests.exceptions import ConnectionError as RequestsConnectionError, Timeout as RequestsTimeout

...
except (RequestsConnectionError, RequestsTimeout, HfHubHTTPError) as exc:
    raise HTTPException(status_code=503, detail={"error": "llm_unavailable"}) from exc
```

임베딩(`embed_text`)과 생성(`generate_answer`) 양쪽에서 발생 가능한 예외를 모두 포괄해야
한다 — 구현 단계에서 `langchain-huggingface`가 실제로 어떤 예외를 감싸서 던지는지(원본
`huggingface_hub`/`requests` 예외를 그대로 전파하는지, 자체 래핑 예외를 던지는지) 확인 후
필요하면 타입을 조정한다.

### 6. `.env` / `.env.example`

```
# LangSmith 관찰가능성 (RAG 챗봇 트레이싱)
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=workflow-ai-rag
# LANGSMITH_API_KEY는 smith.langchain.com에서 발급받아 직접 채울 것 (팀원 각자 로컬 .env에만)
LANGSMITH_API_KEY=
```

`LANGSMITH_API_KEY`는 사용자가 직접 `.env`에 입력하기로 함 — 이 작업에서는 값을 넣지 않는다.

### 7. 테스트

- `test_embedding_service.py`: `InferenceClient` mock → `HuggingFaceEndpointEmbeddings` mock
- `test_generation_service.py`: `httpx.AsyncClient` mock → `ChatHuggingFace.ainvoke` mock
- `test_chat_router_query.py`: 새 예외 타입(`HfHubHTTPError` 등)에 대한 503 변환 테스트로 교체/추가
- LangSmith 트레이싱 자체는 외부 서비스 연동이라 단위 테스트 대상이 아님 (환경변수 존재 여부만
  간접 확인하거나, 수동 검증으로 대체)

## 리스크

- `langchain-huggingface`가 `ChatHuggingFace` + `HuggingFaceEndpoint(task="conversational")`
  조합으로 HF Router의 `/v1/chat/completions`와 동일한 백엔드를 타는지 실제 설치 후 확인
  필요 — 구현 단계에서 첫 스텝으로 검증.
- 예외 타입 매핑(`chat_router.py`)이 설계 문서상 추정이므로, 실제 실패를 유도해 확인하는
  검증 스텝을 구현 계획에 포함해야 한다.
- 패키지 추가로 `requirements.txt`의 `transformers==4.48.0`/`huggingface_hub==0.36.2`와의
  버전 충돌 가능성 — 설치 시 확인.
