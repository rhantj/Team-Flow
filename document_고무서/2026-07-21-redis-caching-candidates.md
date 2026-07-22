# Redis 캐싱 적용 검토

날짜: 2026-07-21

## 현재 상태

`App/docker-compose.yml`에 `redis:7-alpine` 서비스와 `REDIS_URL`/`REDIS_HOST` 환경변수가
정의되어 있지만, 실제 코드에서는 어디서도 쓰이지 않는다. `backend_spring`에는
`spring-boot-starter-data-redis`, `RedisTemplate`, `@Cacheable` 등이 전혀 없고,
`backend_fastapi`에도 `redis`/`aioredis`/`redis.asyncio` import가 없다 — 인프라만
배선되어 있고 죽어있는 상태.

## 다른 팀원 작업과의 관계

**WF-264 "Redis Queue 작업 처리 구조 구현"** (박지수 담당, 해야 할 일, 상위 에픽 WF-200
공통 통합/인프라) — "AI 분석 작업을 queue로 넘기고 jobId/status를 반환한다."

이 작업은 Redis를 **큐**로 쓴다(비동기 job 처리, jobId 상태 추적). 아래에서 검토한
캐싱 후보들은 Redis를 **캐시**로 쓴다(계산 결과 재사용). 목적은 다르지만 같은 Redis
인스턴스를 공유하게 되므로, 클라이언트 연결/설정은 WF-264 쪽에서 먼저 배선한 뒤
캐싱 쪽에서 재사용하는 순서가 합리적이다. WF-264 코멘트에 이 내용을 남겨두었다
(2026-07-21).

**결정: 지금은 구현하지 않는다.** WF-264 진행 상황을 보고 이후 다시 논의.

## 캐싱 후보 (우선순위순)

### 1. 기여도 리포트 LLM 요약 (우선순위 높음)

- 위치: `App/backend_fastapi/ai_contribution_report/app/services/contribution_service.py:49-67`
- 현재 동작: `generate_contribution_reports()`가 팀원별로 task/meeting 데이터를 DB에서
  읽고, `generate_summary()`(31-46행)로 Ollama 챗 LLM을 **팀원마다 매번** 호출한다.
  `contribution_router.py:27`에서 리뷰어가 리포트를 열 때마다 트리거됨.
- 캐싱 이유: LLM 호출이 느리고 비용이 크며, 근거 데이터(할일/회의록 개수)는 리포트
  재조회 사이에 자주 바뀌지 않는다.
- 캐시 키 제안: `(project_id, user_id, 데이터 버전 또는 해시)`

### 2. 워크로드 스코어 대시보드 (우선순위 높음)

- 위치: `App/backend_fastapi/ml_workload_score/app/services/workload_service.py:21-60`
- 현재 동작: `get_workload_score()`가 대시보드 요청마다 `db.load_tasks_from_db()`로
  프로젝트 전체 task를 로드하고 `compute_embedding_adjustments()`로 임베딩 보정까지
  다시 계산한다.
- 캐싱 이유: 대시보드는 자주 열리는데 task 데이터는 상대적으로 완만하게 바뀐다.
- 캐시 키 제안: `project_id` 단위 짧은 TTL, 또는 task 변경 시 invalidate

### 3. Spring 대시보드 집계 (우선순위 중간)

- 위치: `App/backend_spring/.../dashboard/service/DashboardService.java`
  (`getSummary`, `getTasks`, `getActivities`)
- 현재 동작: 요청마다 `TaskRepository`, `MilestoneRepository`, `ActivityRepository`,
  `MlPredictionRepository`, `UserRepository`를 조합해 집계한다.
- 캐싱 이유: 대시보드 새로고침이 잦다. project 단위 짧은 TTL + task/activity 쓰기 시
  invalidate가 적합해 보인다.

### 4. RAG 임베딩/검색 (우선순위 낮음, 보류)

- 위치: `App/backend_fastapi/llm_rag_assistant/app/services/embedding_service.py:8-17`,
  `retrieval_service.py:29-53`
- 현재 동작: 채팅 턴마다 HuggingFace 임베딩 호출 + pgvector 유사도 검색.
- 캐싱이 약한 이유: 질문 텍스트가 매번 달라 캐시 적중률이 낮고, 검색 결과는 임베딩
  벡터 기준 고카디널리티라 캐싱 이득이 크지 않다. (완전히 동일한 질문 반복 시에만
  효과)

### 캐싱 후보 아님

- **GitHub API 연동**: 실제 클라이언트 코드 없음(Swagger 설명 문구에만 "GitHub" 언급).
  캐싱할 대상 자체가 없다.
- **JWT 인증 검증** (`JwtAuthenticationFilter.java:14-47`): 서명/클레임 파싱만 하는
  순수 연산이라 DB/네트워크 조회가 없다. 캐싱해도 이득 없음.
