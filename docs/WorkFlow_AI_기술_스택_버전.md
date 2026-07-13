# 기술 스택 확정 버전

실제 저장소에 설치·검증된 버전 기준. 숫자는 참고용이며, 실제 설치는 각 폴더의 lockfile
(`package-lock.json`, `gradle-wrapper.properties`, `requirements*.txt`)이 정확한 값을 보장합니다.

```
프론트   cd frontend && npm install
백엔드   cd backend && ./gradlew build
AI서버   cd ai-backend && py -3.12 -m venv .venv && .venv/Scripts/pip install -r requirements.txt
DB/Redis docker compose up -d
```

## 6.1 Frontend

| 기술 | 버전 |
|---|---|
| Node.js | 24.x LTS (`.nvmrc`=24) |
| React | 19.2.7 |
| Vite | 7.3.6 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.3.2 |

**호환성 근거**: Vite 7은 Node 20 이상을 요구하며 Node 24 LTS로 통일. React 19.2는 `@types/react` 19 타입 정의와 매칭. Tailwind는 **v4**를 사용 중 — v3와 설정 방식이 완전히 다르므로(CSS-first `@import 'tailwindcss'`, `@tailwindcss/vite` 플러그인, `tailwind.config.js` 불필요) v3로 되돌리면 빌드가 깨짐.

## 6.2 Backend

| 기술 | 버전 |
|---|---|
| Java | 21 LTS |
| Spring Boot | 3.5.16 |
| Spring Security | 6.5.11 (Spring Boot 3.5.16 BOM 포함) |
| Spring Data JPA | Jakarta Persistence API 3.1.0 (BOM 포함, Hibernate ORM 6.6.53.Final) |
| JWT | jjwt 0.13.0 |
| OpenAPI/Swagger | springdoc-openapi 2.8.17 |
| JUnit | 5.12.2 (BOM 포함, Mockito 5.17.0) |
| Build Tool | Gradle 9.5.1 (wrapper 고정) |

**호환성 근거**: Spring Boot 3.x는 Java 17 이상을 요구하며 Java 21 LTS로 통일. Security/JPA/JUnit은 Spring Boot 3.5.16 BOM이 관리하므로 개별 버전을 직접 지정하지 않음. jjwt 0.13은 Java 21과 호환. **springdoc-openapi는 반드시 2.x 라인 사용** — 최신 3.x는 Spring Boot 4 전용이라 3.5.16과 맞지 않음.

## 6.3 AI Backend

| 기술 | 버전 |
|---|---|
| Python | 3.12.13 |
| FastAPI | 0.139.0 |
| Pydantic | 2.13.4 (+ pydantic-settings 2.14.2) |
| Uvicorn | 0.51.0 |

**호환성 근거**: FastAPI 0.139는 Pydantic v2(2.13 이상)를 요구. Python 3.12는 `.python-version`과 일치, ML 패키지(PyTorch/transformers 등) wheel도 3.12를 공식 지원.

## 6.4 Database / Vector DB

| 기술 | 버전 |
|---|---|
| PostgreSQL | 17.10 |
| pgvector | 0.8.5 (PostgreSQL 13 이상 요구) |
| Chroma / FAISS | 미사용 — pgvector로 벡터 검색을 통합했으므로 별도 벡터 DB 불필요 |

**호환성 근거**: pgvector를 쓰기로 확정했으므로 PostgreSQL 계열로 통일(MySQL 미사용). pgvector 0.8.5는 PostgreSQL 13~17을 지원.

## 6.5 ML / DL

| 기술 | 버전 |
|---|---|
| NumPy | 2.5.1 |
| scikit-learn | 1.6.1 |
| XGBoost | 3.2.0 *(신규 추가)* |
| LightGBM | 4.6.0 |
| PyTorch | 2.13.0 (CPU 빌드 권장, 용량 문제로 기본 설치 목록에서 제외 — 필요 시 별도 설치) |
| Hugging Face Transformers | 4.48.0 |
| Tokenizers | 0.23.1 (Transformers 4.48 요구, 자동 설치됨) |
| KoBERT/KLUE-BERT | `klue/bert-base` 권장 (Transformers 4.48 호환, 활발히 관리됨) |
| Whisper | faster-whisper 1.2.1 |

**호환성 근거**: NumPy 2.5는 scikit-learn 1.6 / XGBoost 3.2 / LightGBM 4.6 / Transformers 4.48 전부와 호환 확인(`pip check` 통과, `numpy 2.0 미지원` 이슈는 이 조합에서 해당 없음). Tokenizers는 Transformers 설치 시 자동으로 맞는 버전이 딸려옴. 전체 조합을 실제 venv(Python 3.12.13)에 설치해 임포트 충돌 없음을 검증함.

> FFmpeg(faster-whisper 오디오 처리용)는 pip 패키지가 아닌 OS 바이너리라 별도 설치가 필요합니다. 이 컴퓨터엔 아직 없음 — Windows는 `winget install ffmpeg` 또는 `choco install ffmpeg`로 설치하세요.

## 6.6 LLM

| 기술 | 버전 |
|---|---|
| OpenAI Python SDK | 1.59.7 |
| LangChain | 1.3.12 — **선택**, 미설치(코드에서 아직 미사용) |
| Gemma (로컬 서빙) | Gemma 4, Ollama로 `gemma4:e2b` 태그 서빙 |
| ollama (client) | 0.6.2 |

**호환성 근거**: OpenAI SDK 1.x는 Pydantic v2 기반이라 FastAPI 0.139와 동일 계열이라 충돌 없음. LangChain은 실제 라우터 로직이 구현되기 전이라 설치를 보류함 — 필요해지면 `pip install langchain==1.3.12`.

## 6.7 File Processing

| 기술 | 버전 |
|---|---|
| pdfplumber | 0.11.4 |
| python-docx | 1.1.2 |
| python-pptx | 1.0.2 *(신규 추가)* |
| ReportLab | 5.0.0 *(신규 추가)* |
| FFmpeg | 미설치 — 위 6.5 참고 |

## 6.8 GitHub 연동

| 기술 | 버전 |
|---|---|
| GitHub REST API | `2022-11-28` 버전 헤더 고정 |
| GitHub GraphQL API | v4 |
| Webhook | GitHub App 또는 OAuth App 이벤트 구독 |

아직 FS-6 담당 기능 구현 전이라 참고용 기록만 해둠 (버전 pin이 아니라 API 호출 시 헤더/엔드포인트 규칙).

## 6.9 Infra

| 기술 | 버전 |
|---|---|
| Docker Engine | 29.6.1 |
| Docker Compose | v5.2.0 |
| Redis | 7.4.9 (`redis:7-alpine` 이미지, 실측) |
| GitHub Actions | 미설정 — 도입 시 `ubuntu-24.04` 러너 권장 |

**호환성 근거**: Redis 7.4는 Spring Data Redis(Spring Boot 3.5.16 BOM 포함) 및 Lettuce 클라이언트와 공식 호환.

---

## 이번에 새로 설치/검증한 것
`ai-backend/.venv`(Python 3.12.13)에 아래를 실제로 설치하고 `pip check`로 충돌 없음을 확인했습니다:
- `numpy==2.5.1`, `xgboost==3.2.0` *(신규)*
- `python-pptx==1.0.2`, `reportlab==5.0.0` *(신규, `requirements.txt`에 추가)*
- 기존 `requirements-ml.txt` 전체(`faster-whisper`, `scikit-learn`, `lightgbm`, `transformers`, `ollama`) 재설치 확인

## 설치를 보류한 것 (이유 포함)
- **PyTorch**: 용량이 커서(수 GB) 자동 설치 대상에서 제외 — 필요할 때 `pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu`
- **LangChain**: 코드에서 아직 안 쓰여서 미설치, 필요 시 설치
- **FFmpeg**: pip으로 못 깔리는 OS 바이너리, 별도 설치 필요
