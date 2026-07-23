# Redis Stream Queue + FastAPI Cache + OCI Safeguards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의록 분석을 유실 방지 Redis Stream queue로 전환하고, FastAPI 회의록/RAG 캐시와 OCI 운영용 영속성·ACL·readiness 검증을 추가한다.

**Architecture:** Spring은 `meeting-analysis` Stream에 JSON job을 XADD하고 단일 background worker가 consumer group으로 pending/new record를 처리한다. DB 처리 후에만 ACK/XDEL하며 이미 `completed`/`failed`인 회의는 멱등 skip한다. FastAPI는 Redis 장애 시 fail-open하는 두 cache를 사용하고, OCI Redis는 AOF volume과 역할별 ACL을 적용한다.

**Tech Stack:** Java 21, Spring Boot 3.5.16, Spring Data Redis/Lettuce, Redis 7 Streams, Python 3.12, FastAPI, redis-py 8.0.1, Docker Compose, GitHub Actions.

## Global Constraints

- Source of truth: `document_고무서/2026-07-23-redis-queue-and-caching-design.md`.
- Redis Stream key는 `meeting-analysis`, group은 `meeting-analysis-workers`, consumer는 `meeting-analysis-worker`다. retry/DLQ/priority용 key를 추가하지 않는다.
- `MeetingAnalysisService`의 동기 텍스트 추출 위치와 기존 REST 상태 문자열을 유지한다. DB schema와 frontend는 변경하지 않는다.
- Worker는 Spring 컨테이너당 단일 thread다. 처리 반환 전 ACK하지 않으며 payload 원문을 로그에 남기지 않는다.
- enqueue 실패는 `MeetingAnalysisPersistence.saveAnalysisFailure()`로 `failed` 전환한다.
- pending 복구 시 meeting 상태가 `completed`/`failed`면 Runner를 다시 실행하지 않고 ACK/XDEL한다.
- Spring→FastAPI timeout은 connect 5초/read 45초, Spring stop grace는 60초다.
- 회의 분석 cache TTL은 86,400초, RAG cache TTL은 1,800초다. Redis/JSON 오류는 warning 후 cache miss로 처리한다.
- 운영 Redis는 named volume+AOF everysec+`noeviction`, host port 미게시, `spring`/`fastapi`/`admin` ACL을 사용한다. 비밀번호 기본값과 hardcoded secret을 금지한다.
- TDD: 각 production behavior 전에 실패 테스트를 실행하고 RED 근거를 report에 남긴다.

---

### Task 1: Spring Redis 연결과 Stream Publisher

**Files:**
- Modify: `App/backend_spring/build.gradle`
- Modify: `App/backend_spring/src/main/resources/application.yml`
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisJob.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisJobPublisher.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisJobPublisherTest.java`

**Interfaces:**
- `record MeetingAnalysisJob(String jobId, Long meetingId, AiAnalyzeRequest request)`
- `MeetingAnalysisJobPublisher.STREAM_KEY = "meeting-analysis"`
- `String enqueue(Long meetingId, AiAnalyzeRequest request)` returns Redis record id and throws `IllegalStateException` when serialization/XADD fails.

- [ ] **Step 1: RED — publisher test first**

Mock `StringRedisTemplate.opsForStream()`. Capture the `MapRecord` passed to `add`, deserialize its `payload`, and assert nonblank UUID, meeting id, full request, and stream key. Add serialization failure coverage. Do not inspect/log raw payload on failure.

Run:

```bash
cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisJobPublisherTest"
```

Expected: compilation failure because production types do not exist.

- [ ] **Step 2: GREEN — dependency, settings, job, publisher**

Add `spring-boot-starter-data-redis`. Configure:

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
      username: ${REDIS_USERNAME:}
      password: ${REDIS_PASSWORD:}
```

Publisher serializes one immutable job and XADDs a single field named `payload` to `meeting-analysis`.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisJobPublisherTest" && ./gradlew compileJava
git add App/backend_spring/build.gradle App/backend_spring/src/main/resources/application.yml App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisJob.java App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisJobPublisher.java App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisJobPublisherTest.java
git commit -m "feat: publish meeting analysis jobs to Redis Stream"
```

---

### Task 2: Reliable Stream Worker, Pending Recovery, and Idempotency

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisQueueWorker.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java`
- Delete: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisQueueWorkerTest.java`

**Interfaces:**
- Worker implements `ApplicationRunner` and exposes package-visible `pollOnce()`, `boolean isReady()`, `boolean isWorkerAlive()`, and `shutdown()`.
- Group=`meeting-analysis-workers`, consumer=`meeting-analysis-worker`, payload field=`payload`.
- `MeetingRepository.findById()` is checked before Runner invocation.

- [ ] **Step 1: RED — worker behavior tests**

Write tests proving:

1. pending records are read before `ReadOffset.lastConsumed()` new records;
2. processing meeting invokes Runner, then ACK and XDEL in order;
3. completed/failed/missing meeting skips Runner but ACKs/XDELs;
4. Runner exception leaves the record pending and does not XDEL;
5. malformed payload never logs payload, then ACKs/XDELs the poison record;
6. Redis errors increase backoff up to 5 seconds and a successful poll resets it;
7. group initialization sets readiness, shutdown interrupts and joins.

Run focused test; expected compilation failure for missing worker.

- [ ] **Step 2: GREEN — worker implementation**

Create the group idempotently, tolerating BUSYGROUP only. Use `StreamReadOptions.block(Duration.ofSeconds(5)).count(1)`. Read same-consumer pending with offset `0` before new records. ACK+XDEL only after successful Runner return or terminal-state skip. Log record id/job id/meeting id only. Implement exponential delays `250ms, 500ms, 1s, 2s, 4s, 5s` and bounded shutdown join.

Remove `@Async` import/annotation from Runner and delete Async config.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisQueueWorkerTest" --tests "com.workflowai.meeting.MeetingAnalysisRunnerTest"
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisQueueWorker.java App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisQueueWorkerTest.java
git rm App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java
git commit -m "feat: consume meeting jobs reliably from Redis Stream"
```

---

### Task 3: Service Enqueue Wiring and Failure State

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java`
- Modify: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`

**Interfaces:** `MeetingAnalysisService` depends on Publisher instead of Runner.

- [ ] **Step 1: RED — update tests first**

Replace Runner mock with Publisher mock. Assert analyze enqueues after commit, retry enqueues only a failed meeting, and both immediate/after-commit enqueue exceptions call `saveAnalysisFailure(meetingId, DEFAULT_ANALYSIS_ERROR_MESSAGE)`. Keep text extraction assertions unchanged.

Run meeting service tests; expected compilation/test failure while service still calls Runner.

- [ ] **Step 2: GREEN — enqueue with failure transition**

Change `runAnalysisAfterCommit` and retry to call a private `enqueueSafely` helper. It catches publisher failures, logs meeting id without request/payload, and invokes persistence failure. Do not throw after an after-commit enqueue failure.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest" --tests "com.workflowai.meeting.*"
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java
git commit -m "refactor: enqueue meeting analysis with failure recovery"
```

---

### Task 4: FastAPI Timeout and Spring Queue Readiness

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/FastApiMeetingClient.java`
- Modify: `App/backend_spring/src/main/resources/application.yml`
- Create: `App/backend_spring/src/test/java/com/workflowai/meeting/FastApiMeetingClientTest.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/common/HealthController.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/common/HealthResponse.java`
- Create: `App/backend_spring/src/test/java/com/workflowai/common/HealthControllerTest.java`

**Interfaces:** `/api/v1/health` returns non-200/`DOWN` when Redis PING fails, group is not initialized, or worker thread is dead; otherwise `UP`.

- [ ] **Step 1: RED — timeout and readiness tests**

Use JDK `HttpServer` delaying a response beyond a small test read-timeout and assert the client fails within the bound. Health tests mock `RedisConnectionFactory` and Worker for UP, Redis-down, not-ready, and dead-thread cases. Never include exception details in response.

- [ ] **Step 2: GREEN — bounded client and meaningful health**

Configure `workflow.ai.connect-timeout-seconds=${WORKFLOW_AI_CONNECT_TIMEOUT_SECONDS:5}` and read timeout 45. Set `HttpClient.connectTimeout` and `JdkClientHttpRequestFactory.setReadTimeout`. Extend health response minimally with Redis/worker status or return `503` envelope on DOWN.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.FastApiMeetingClientTest" --tests "com.workflowai.common.HealthControllerTest"
git add App/backend_spring/src/main/java/com/workflowai/meeting/FastApiMeetingClient.java App/backend_spring/src/main/resources/application.yml App/backend_spring/src/test/java/com/workflowai/meeting/FastApiMeetingClientTest.java App/backend_spring/src/main/java/com/workflowai/common/HealthController.java App/backend_spring/src/main/java/com/workflowai/common/HealthResponse.java App/backend_spring/src/test/java/com/workflowai/common/HealthControllerTest.java
git commit -m "feat: add meeting client timeouts and queue readiness"
```

---

### Task 5: FastAPI Redis Clients with Optional ACL Credentials

**Files:**
- Modify: `requirements.txt`
- Modify: `App/backend_fastapi/core/config.py`
- Create: `App/backend_fastapi/core/cache.py`
- Modify: `App/backend_fastapi/tests/test_config.py`
- Create: `App/backend_fastapi/tests/test_cache.py`

**Interfaces:** `Settings.redis_url`, optional `redis_username`, optional `redis_password`; cached `get_redis_client()` and `get_async_redis_client()`.

- [ ] **Step 1: RED — config/client tests**

Test defaults, env overrides, sync/async singleton identity, and forwarding username/password to `from_url`. Reset caches between tests without mutating production globals; use `@lru_cache` functions and `.cache_clear()`.

- [ ] **Step 2: GREEN — clients**

Add `redis==8.0.1`. Implement typed clients with `decode_responses=True` and optional ACL credentials. Client construction must not connect eagerly.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_fastapi && python -m pytest tests/test_config.py tests/test_cache.py -q
git add requirements.txt App/backend_fastapi/core/config.py App/backend_fastapi/core/cache.py App/backend_fastapi/tests/test_config.py App/backend_fastapi/tests/test_cache.py
git commit -m "feat: add ACL-aware Redis clients for FastAPI"
```

---

### Task 6: Meeting Analysis Cache

**Files:**
- Modify: `App/backend_fastapi/app/main.py`
- Modify: `App/backend_fastapi/tests/test_meeting_analysis.py`

- [ ] **Step 1: RED — complete key, TTL, fail-open tests**

Tests must show same full input hits once; changes to project id/title/date/text/participants/kind/type/provider/model miss; TTL passed to SET is 86400; client creation/get/set/corrupt JSON failures log warning and still return analysis; corrupt entry is deleted. Fake Redis records `ex` and deleted keys.

- [ ] **Step 2: GREEN — cache wrapper**

Hash a canonical JSON object containing schema version and every result-determining input. Split `_analyze_json_uncached`. Catch client creation as well as operations/validation. Never log request text or cached value.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_fastapi && python -m pytest tests/test_meeting_analysis.py -q
git add App/backend_fastapi/app/main.py App/backend_fastapi/tests/test_meeting_analysis.py
git commit -m "feat: cache meeting analysis by complete input hash"
```

---

### Task 7: RAG Exact-Match Cache

**Files:**
- Modify: `App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py`
- Modify: `App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py`

- [ ] **Step 1: RED — cache behavior tests**

Test project/assignee/question scoped key, exact hit without embed/search/generation, miss then reuse, TTL 1800, corrupt JSON deletion, and client/get/set failures with warning log. Preserve existing personal-intent behavior.

- [ ] **Step 2: GREEN — async fail-open cache**

Add schema version to the hashed basis. Fetch cache before embedding. Validate with `RagQueryResponse.model_validate_json`; delete poison data and recompute. Do not use silent `except`.

- [ ] **Step 3: Verify and commit**

```bash
cd App/backend_fastapi && python -m pytest tests/llm_rag_assistant/test_chat_service.py -q
git add App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py
git commit -m "feat: cache exact-match RAG answers safely"
```

---

### Task 8: Redis AOF Volume, ACL, and Compose Security

**Files:**
- Modify: `App/docker-compose.yml`
- Modify: `App/docker-compose.prod.yml`
- Modify: `App/.env.example`
- Create: `App/redis/redis-entrypoint.sh`
- Create: `App/redis/users.acl.template`
- Create: `App/tests/test_redis_compose.sh`

**Interfaces:** production requires `REDIS_ADMIN_PASSWORD`, `REDIS_SPRING_PASSWORD`, `REDIS_FASTAPI_PASSWORD` with no defaults.

- [ ] **Step 1: RED — static Compose security test**

Shell test renders compose with temporary non-secret values and asserts `/data` named volume, AOF everysec, noeviction, prod `ports: []`, 60-second Spring grace, ACL usernames, matching backend credentials, and no password literal/default. It must also assert Redis healthcheck authenticates.

- [ ] **Step 2: GREEN — secure Redis runtime**

Base compose enables named volume, AOF everysec, noeviction. Prod overlay removes host port and uses an entrypoint that renders a mode-600 ACL file at runtime from required environment variables, then starts Redis with default user off. Limit `spring` to `meeting-analysis*` and stream/client/ping commands; limit `fastapi` to cache prefixes and get/set/del/client/ping; reserve all commands for admin. Do not print secrets. Add backend ACL env wiring and `stop_grace_period: 60s`.

- [ ] **Step 3: Runtime smoke and commit**

```bash
bash App/tests/test_redis_compose.sh
cd App && docker compose -f docker-compose.yml -f docker-compose.prod.yml config --quiet
git add App/docker-compose.yml App/docker-compose.prod.yml App/.env.example App/redis/redis-entrypoint.sh App/redis/users.acl.template App/tests/test_redis_compose.sh
git commit -m "feat: harden Redis persistence and ACLs for OCI"
```

Never print rendered Compose config because it contains credentials.

---

### Task 9: OCI Deploy Gates, Runbook, and End-to-End Verification

**Files:**
- Modify: `.github/workflows/deploy-oci.yml`
- Modify: `App/DEPLOY_OCI.md`
- Create: `docs/trouble-shooting/2026-07-23-redis-queue-oci.md`

- [ ] **Step 1: RED — workflow/runbook assertions**

Extend the static shell test to require CI checks for public Spring readiness, local FastAPI health, authenticated Redis PING, consumer group existence, and rollback queue warning. Assert runbook checks external closure of 5432/6379/9092/8000/8080 and documents key rotation without values.

- [ ] **Step 2: GREEN — deployment gates**

After compose up, remote checks must run inside OCI without echoing env: authenticated Redis PING, FastAPI `/api/v1/health`, Spring `/api/v1/health`, and `XINFO GROUPS meeting-analysis`. Public health remains required. Rollback logs pending/length and warns that old code cannot drain Stream before rollback.

Document AOF/ACL verification, Spring kill/restart pending recovery, Redis recreation persistence, enqueue failure→FAILED, cache hit timing, payload-log scan, and mandatory rotation of previously exposed credentials.

- [ ] **Step 3: Full verification**

```bash
cd App/backend_spring && ./gradlew test
cd ../backend_fastapi && python -m pytest -q
cd ../.. && bash App/tests/test_redis_compose.sh
git diff --check
```

Manual staging checks:

```bash
docker exec workflow-redis redis-cli --user admin --pass "$REDIS_ADMIN_PASSWORD" INFO persistence
docker exec workflow-redis redis-cli --user admin --pass "$REDIS_ADMIN_PASSWORD" XINFO GROUPS meeting-analysis
docker exec workflow-redis redis-cli --user admin --pass "$REDIS_ADMIN_PASSWORD" XPENDING meeting-analysis meeting-analysis-workers
```

Do not paste secrets or full queue payloads into logs/reports.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-oci.yml App/DEPLOY_OCI.md docs/trouble-shooting/2026-07-23-redis-queue-oci.md
git commit -m "ci: verify Redis queue readiness during OCI deploy"
```

## Final Review Gate

- [ ] Review every task commit for spec compliance and code quality.
- [ ] Run a final security review for hardcoded secrets, ACL over-permission, payload logging, and unauthenticated Redis paths.
- [ ] Confirm `git status` contains no build artifacts, credential files, or unrelated changes.
- [ ] Do not push, merge, or deploy without a separate explicit user request.
