# WorkFlow AI 시스템 설계 발표자료 원고

분석 기준: `feature/kanban` 브랜치의 `7347ed4` 소스. 저장소 문서와 구현이 다를 경우 실행 소스와 설정 파일을 우선했다.

발표 대상은 프로젝트 심사자·기술 리뷰어로 가정한다. 발표가 끝났을 때 청중은 “WorkFlow AI가 React–Spring Boot–FastAPI를 역할별로 분리하고, 회의록에서 생성된 업무가 DB와 업무보드까지 추적 가능하며, AI 분석 결과도 운영 데이터로 환류된다”는 점을 이해해야 한다.

---

## 4.1 시스템 아키텍처

### 4.1.1 전체 시스템 구성도

**슬라이드 제목:** 사용자 요청은 Spring Boot가 통제하고, AI 연산은 FastAPI가 전담한다

```text
[사용자 브라우저]
       │ HTTPS / REST
       ▼
[Nginx + React SPA]
       │ /api/* Reverse Proxy
       ▼
[Spring Boot API :8080] ───── 내부 HTTP ─────▶ [FastAPI AI :8000]
       │                                           │
       │ JPA / SQL                                 │ asyncpg / SQLAlchemy
       ▼                                           ▼
[PostgreSQL 17 + pgvector] ◀────────────────────────┘
       │
       ├─ 업무·회의·멤버·기여도·예측 결과
       └─ RAG 문서 청크와 벡터 임베딩

[Redis / Kafka]
  Docker Compose에는 개발 인프라로 선언되어 있으나 현재 핵심 애플리케이션 코드의
  직접 의존성과 메시지 처리 경로는 확인되지 않음
```

- React는 화면·상태·라우팅과 API 호출을 담당한다.
- Spring Boot는 JWT/OAuth 인증, 프로젝트 권한, 업무·회의·대시보드 CRUD, 트랜잭션을 담당한다.
- FastAPI는 회의록 분석, RAG, 지연 위험도, 업무 편중, 기여도 계산을 담당한다.
- PostgreSQL은 서비스 데이터와 AI 결과를 함께 보관하며, pgvector가 RAG 검색을 제공한다.

**발표 포인트:** AI 서버를 외부에 직접 노출하지 않고 Spring Boot가 권한과 호출 빈도를 통제하는 BFF/API Gateway 역할을 수행한다.

근거: `App/frontend/nginx.prod.conf`, `App/backend_spring/src/main/resources/application.yml`, `App/backend_fastapi/app/main.py`, `App/docker-compose.yml`

### 4.1.2 React / Spring Boot / FastAPI 구조

**슬라이드 제목:** 세 런타임은 화면·업무 규칙·AI 연산으로 책임이 분리된다

| 계층 | 핵심 책임 | 구현 구조 |
|---|---|---|
| React 19 | SPA 화면, 인증 가드, 업무보드·회의·대시보드 UI | `routes`, 도메인별 `screen/components/libs`, 공통 `global/api` |
| Spring Boot 3.5 | 인증·인가, 프로젝트 범위 검증, CRUD, 트랜잭션, AI 오케스트레이션 | Controller → Service → Repository/JPA, FastAPI용 RestClient |
| FastAPI 0.139 | LLM/RAG 및 ML 추론 | 기능별 Router → Service → DB/Model (`llm_rag_assistant`, `ml_delay_risk`, `ml_workload_score`, `contribution_score`) |

- React의 모든 보호 화면은 `RequireAuth`, 심사자 화면은 `RequireRole`로 분리된다.
- Spring의 `@PreAuthorize`가 프로젝트 멤버·역할 권한을 최종 검증한다.
- FastAPI는 내부 AI API를 제공하고 Spring이 응답을 공통 `ApiResponse`로 변환한다.
- 회의록 AI 장애 시 Spring의 규칙 기반 fallback 분석기가 동작한다.

### 4.1.3 Docker 기반 개발 환경

**슬라이드 제목:** 한 개의 Compose 파일로 프론트·API·AI·데이터 계층을 재현한다

- 컨테이너: `frontend`, `backend-spring`, `backend-fastapi`, `db`, `redis`, `kafka`.
- 개발 포트: React/Nginx `5173`, Spring `8080`, FastAPI `8000`, PostgreSQL `5432`.
- DB와 Redis는 health check 후 백엔드가 시작된다.
- PostgreSQL 초기 스키마는 `db/init`을 read-only volume으로 주입한다.
- Spring은 JDK 21 빌드 → JRE 21 실행의 multi-stage 이미지다.
- React는 Node 24/pnpm 빌드 → Nginx 정적 배포의 multi-stage 이미지다.
- FastAPI는 Python 3.12 slim에 ML/LLM 패키지를 설치하고, entrypoint에서 지연위험 모델을 준비한다.

**개발/운영 차이:** 운영 overlay는 pgvector 이미지를 사용하고 DB·Redis·Kafka·백엔드 포트를 loopback에만 바인딩하며, 외부에는 Nginx의 80/443만 공개한다.

### 4.1.4 OCI 배포 및 CI/CD 구조

**슬라이드 제목:** main 병합이 OCI 배포·상태 확인·자동 롤백으로 이어진다

```text
main push
  → GitHub Actions
  → OCI SSH 접속
  → 현재 HEAD를 deploy-previous 태그로 보존
  → origin/main fetch + reset
  → base compose + prod overlay build/up
  → HTTPS health check(최대 20회)
  ├─ 성공: 배포 완료
  └─ 실패: deploy-previous로 reset → 재배포 → health check → Slack 알림
```

- OCI 운영: Nginx TLS 종료, Let's Encrypt/Certbot 갱신, 내부 Docker DNS 기반 프록시.
- GitHub Secrets: OCI SSH 키·호스트·사용자·도메인·Slack webhook.
- `concurrency: deploy-oci`, `cancel-in-progress: false`로 배포 중복을 직렬화한다.
- **소스 기준 주의점:** 현재 `.github/workflows`에는 배포 workflow만 있고 PR 빌드·단위 테스트를 수행하는 별도 CI workflow는 없다. 따라서 발표에서는 “CD·롤백 자동화 구현 완료, PR CI gate는 보완 항목”으로 표현하는 것이 정확하다.

---

## 4.2 데이터베이스 및 API 설계

### 4.2.1 ERD

**슬라이드 제목:** 프로젝트를 중심으로 업무·회의·AI 결과가 동일한 관계망에 연결된다

```text
users ──< project_members >── projects
  │                              │
  │                              ├──< milestones ──< tasks
  │                              │                    ├──< task_checklists
  │                              │                    ├──< task_comments
  │                              │                    └──1 task_results ──< links/files
  │                              │
  └──< meeting_attendees >── meetings ──1 meeting_analysis
                                 └──< meeting_action_items >── tasks(created_task_id)

projects ──< document_chunks      (RAG)
projects ──< ml_predictions       (지연 위험도 이력)
projects ──< contribution_reports (AI 기여도 서술)
projects ──< evaluation_scores    (최종 평가)
```

- 초기화 SQL 기준 26개 테이블(기본 24개 + 회의 AI 확장 2개).
- 대부분의 업무 데이터는 `project_id`로 테넌트 범위를 분리한다.
- 회의록과 업무는 `tasks.source_meeting_id`, `meeting_action_items.created_task_id`로 양방향 추적한다.
- 회의 삭제 시 생성 업무와 후보는 기본 보존하고 원본 회의 FK만 `SET NULL`할 수 있다.

### 4.2.2 주요 테이블 정의

**슬라이드 제목:** 핵심 테이블은 원본·AI 후보·승인 결과를 분리해 추적성을 보장한다

| 테이블 | 핵심 컬럼 | 역할 |
|---|---|---|
| `projects` / `project_members` | title, deadline / user_id, role | 프로젝트 범위와 RBAC |
| `tasks` | status, category, assignee_id, due_date, position, source_type, source_meeting_id | 칸반 보드의 단일 업무 원장 |
| `meetings` | transcript, analysis_status, uploaded_by | 회의 원문과 비동기 처리 상태 |
| `meeting_analysis` | summary, decisions, risks, keywords, analysis_engine | 회의 단위 AI 분석 결과 |
| `meeting_action_items` | 추천/최종 담당자, 승인 여부, created_task_id, basis | AI To-Do 후보와 승인 추적 |
| `document_chunks` | source_type/id, content, embedding | 프로젝트 범위 RAG 검색 자료 |
| `ml_predictions` | target_id, model_type, result, score, created_at | append-only ML 추론 이력 |
| `contribution_reports` | user_id, summary, evidence(JSONB) | 심사자용 AI 서술형 근거 |
| `evaluation_scores` | score, is_public | 프로젝트별 최종 평가 점수 |

**스키마 주의점:** 기본 SQL의 `document_chunks.embedding`은 JSONB이고, `docs/db/migrations/001_document_chunks_vector.sql` 적용 후 `VECTOR(768)`과 IVFFlat cosine index를 사용한다. 운영은 `pgvector/pgvector:pg17` 이미지가 전제다.

### 4.2.3 회의록 AI → To-Do → 업무보드 데이터 흐름

**슬라이드 제목:** AI가 제안하고 사용자가 승인한 업무만 보드의 실제 Task가 된다

1. React가 파일/텍스트·회의 정보·참석자를 Spring의 `POST /projects/{id}/meetings/analyze`로 전송한다.
2. Spring이 `meetings`, `meeting_attendees`를 저장하고 `processing` 상태와 `meetingId`를 즉시 반환한다.
3. 백그라운드 Runner가 FastAPI `POST /api/v1/meetings/analyze-json`을 호출한다.
4. FastAPI가 문서/음성을 전처리하고 LLM으로 요약·결정·위험·키워드·To-Do 후보를 구조화한다.
5. 실패 시 Spring fallback 분석기를 사용한다. 결과 출처는 `FASTAPI` 또는 `SPRING_FALLBACK`으로 기록한다.
6. Spring이 `meeting_analysis`와 `meeting_action_items`를 저장하고 회의/후보를 RAG에 ingest한다.
7. React는 status API를 polling하고 팀장이 후보 담당자·기한·우선순위를 검토한다.
8. 승인 요청 `POST /{meetingId}/tasks/register`가 `tasks(source_type=MEETING_AI)`를 생성한다.
9. 후보에 `approved=true`, `created_task_id`를 기록하고 담당자 알림을 생성한다.
10. 업무보드는 동일 프로젝트의 `GET /projects/{id}/tasks`를 다시 조회하므로 새 업무가 즉시 칸반에 나타난다.

**무결성 장치:** 제목·담당자·기한 및 `created_task_id`를 검사해 중복 등록을 막고, 프로젝트 멤버이면서 회의 참석자인 사용자만 자동 담당자로 확정한다.

### 4.2.4 API 명세 및 Swagger 문서화

**슬라이드 제목:** 외부 API는 Spring에 집약하고 두 백엔드가 각각 OpenAPI 문서를 제공한다

| 도메인 | 대표 Spring API |
|---|---|
| 인증/사용자 | `/api/v1/auth/*`, `/api/v1/me` |
| 프로젝트 | `/api/v1/projects`, `/{projectId}/members` |
| 업무보드 | `/projects/{projectId}/tasks`, checklist/comment/result 하위 API |
| 회의 AI | `/projects/{projectId}/meetings/analyze`, status, retry, tasks/register |
| 대시보드 | `/projects/{projectId}/dashboard/{summary|tasks|activities|progress}` |
| AI 프록시 | `/api/v1/ai/rag/query`, `/api/v1/ai/contribution/{score|report}` |

- Spring: springdoc-openapi `2.8.17`, `@Tag`, `@Operation`, `@Parameter`, `@Schema` 사용. Swagger UI는 `/swagger-ui/index.html`.
- FastAPI: Pydantic response model 기반 자동 OpenAPI. Swagger UI는 `/docs`, schema는 `/openapi.json`.
- 인증은 JWT Bearer, 프로젝트 범위는 `@PreAuthorize`로 방어한다.
- 공통 응답은 `success/data/error` 형태의 `ApiResponse`로 통일한다.
- FastAPI 내부 경로는 `/ai/rag`, `/ai/score`, `/ai/predict/delay`; 외부 클라이언트는 Spring 경로만 호출하는 구성이 기본이다.

---

## 4.3 기술 스택 및 AI 구조

### 4.3.1 Frontend / Backend / DB 기술 스택

**슬라이드 제목:** 검증된 웹 스택 위에 Python AI 계층과 pgvector를 결합했다

| 영역 | 소스에서 확인한 기술 |
|---|---|
| Frontend | Node 24, React 19.2.7, TypeScript 5.9.3, Vite 7.3.6, Tailwind 4.3.2, MUI 7.3.5, React Router 7.13, Recharts 2.15 |
| Business Backend | Java 21, Spring Boot 3.5.16, Spring Security, Spring Data JPA/Hibernate, JWT jjwt 0.13, springdoc 2.8.17, Gradle 9.5.1 |
| AI Backend | Python 3.12, FastAPI 0.139, Pydantic 2.13, Uvicorn 0.51, asyncpg, SQLAlchemy |
| Database | PostgreSQL 17, pgvector(VECTOR 768), JSONB, Supabase Storage 선택 연동 |
| AI/ML | Hugging Face API, Ollama, scikit-learn 1.6.1, LightGBM 4.6, XGBoost 3.2, CatBoost 1.2.10, pandas 2.2.3 |
| Infra | Docker Compose, Nginx 1.27, GitHub Actions, OCI, Certbot |

### 4.3.2 LLM / RAG 적용 구조

**슬라이드 제목:** 프로젝트 데이터만 검색해 답변하고 출처를 함께 반환한다

```text
[회의/업무/Action Item 저장]
  → text chunking
  → Ollama nomic-embed-text 임베딩(768차원)
  → document_chunks 저장

[사용자 질문]
  → 질문 임베딩
  → project_id 필터 + cosine distance(<=>)
  → 상위 5개 검색(회의 청크 최소 2개 보정)
  → Hugging Face Chat Completions에 context 전달
  → answer + source_type/id + snippet + similarity 반환
```

- 프로젝트 ID를 SQL 검색 조건에 포함해 다른 프로젝트 데이터 혼입을 막는다.
- 검색 결과가 없으면 근거가 없음을 답하도록 system prompt가 제한한다.
- 생성 모델 호출에는 `HF_TOKEN`이 필요하고, Spring은 실패를 503 형태로 안전하게 변환한다.
- Spring 측 프로젝트별 rate limiter가 RAG 남용을 방지한다.
- 회의 요약과 Action Item, 승인된 Task가 다시 RAG에 ingest되어 업무 지식이 누적된다.

### 4.3.3 ML 지연위험도 및 업무 편중 분석 구조

**슬라이드 제목:** 업무 진행 이력은 지연 확률과 팀 내 편중 신호로 재가공된다

**지연 위험도**

- 입력: 업무 상태·우선순위·카테고리·기한, 체크리스트 진행률, 댓글·활동, 현재 상태 체류시간.
- 파생값: 경과율, 진행률 불균형, blocked 비율, 최근 3일 활동량, 마일스톤 미해결 여부 등.
- 학습: Apache Jira 데이터의 1/3/7/14/30일 snapshot, Proxy Deadline 기반 3단계 라벨.
- 추론: LightGBM이 기본이며 artifact는 CatBoost/XGBoost/Random Forest도 지원한다.
- 출력: `NORMAL/CAUTION/DANGER` 확률과 최고 확률을 `ml_predictions`에 append-only 저장한다.
- Spring 대시보드는 Task별 가장 최근 예측을 조합한다.

**업무 편중**

- 피처: 활성 업무 상대량, 완료율, 평균 난이도 상대값, 지연 비율.
- 난이도: `priority weight + category adjustment + embedding adjustment`.
- 임베딩 보정: 어려운/쉬운 앵커와의 cosine 유사도 차이 × 0.3.
- 15명 미만 팀: MAD 기반 Modified Z-score(임계 3.5), 15명 이상: Isolation Forest 200 trees.
- 0~100 편중 점수와 `정상/과부하 의심/저활동 의심` 방향 태그를 반환한다.
- 설명용 규칙 점수: `0.4×활성업무상대량 + 0.3×(1-완료율) + 0.2×난이도상대값 + 0.1×지연비율`.

### 4.3.4 기여도 점수 계산 구조

**슬라이드 제목:** 기여도는 업무 수행·회의 참여·저활동 여부를 가중 결합한다

```text
기여도 = 0.2016 × workload_component
       + 0.4911 × task_component
       + 0.3073 × meeting_component
```

- `task_component = 완료율 × 100`.
- `meeting_component = 참석 회의 수 / 전체 회의 수 × 100`; 회의가 없으면 불이익 없이 100점.
- `workload_component`: 저활동 의심일 때만 `100 - overload_score`, 정상·과부하 의심은 100점.
- 가중치는 PCA/엔트로피 실험 결과를 반영했으며 합계는 1이다.
- FastAPI가 DB의 업무와 참석 정보를 읽어 팀원별 점수를 계산하고 Spring이 `REVIEWER` 역할만 호출하도록 제한한다.
- 별도 LLM 기여도 리포트는 To-Do 완료, 회의 참석, 선택적 업무 편중 근거를 문장으로 요약해 `contribution_reports`에 저장한다.

**해석 원칙:** 상대적 업무 편중 점수는 프로젝트 간 절대 비교에 사용하지 않고, 팀 내부 재배분·리뷰 근거로만 사용한다.

---

## 발표 마무리 문장

WorkFlow AI의 핵심은 AI 기능을 별도 서비스로 추가한 데 그치지 않는다. 회의 원문, AI 후보, 사람의 승인, 실제 업무, 예측 결과를 하나의 프로젝트 데이터 모델로 연결해 “AI가 제안하고 사람이 확정하며 시스템이 계속 학습 가능한 근거를 남기는” 업무 흐름을 구현했다.

## 소스 기준 보완 필요 항목

1. 현재 GitHub Actions는 배포·헬스체크·롤백 중심이며 PR 빌드/테스트 CI gate는 별도 구현이 필요하다.
2. `workload_scores`는 기여도 리포트 코드에서 선택적으로 조회하지만 초기화 SQL에는 없다. 현재 숫자 기여도 API는 업무 편중을 즉시 계산하므로 동작 경로가 다르다.
3. Redis·Kafka는 Compose에 선언되어 있지만 현재 주요 Spring/FastAPI 의존성 및 메시지 흐름에는 직접 연결되지 않았다.
4. pgvector migration 적용 여부에 따라 `document_chunks.embedding` 타입이 JSONB 또는 VECTOR(768)로 달라지므로 운영 초기화 절차에서 migration을 명시해야 한다.

