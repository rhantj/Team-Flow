# 회의록 AI 분석 Redis Queue 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의록 AI 분석을 Spring 내부 `@Async` 실행에서 Redis Queue(List) + 단일 Worker 스레드 기반 처리로 전환해, 서버 재시작 시 작업 유실, 재시도 관리 불가, 동시 요청 시 스레드 부담 문제를 해결한다.

**Architecture:** `MeetingAnalysisService.analyze()`/`retry()`는 더 이상 직접 분석을 트리거하지 않고 `meeting-analysis` Redis List에 job을 등록(`queued`)한다. 신규 `MeetingAnalysisWorker`가 단일 백그라운드 스레드에서 블로킹 pop으로 job을 소비하고, 기존 `MeetingAnalysisRunner`(FastAPI 호출 → Spring fallback → DB 저장)를 그대로 재사용해 실제 분석을 수행한다. 실패 시 `meeting-analysis:retry` Redis Sorted Set(지연 재시도, 최대 3회, 30s/60s/180s)에 등록하고, `@Scheduled` 폴러가 만료된 재시도를 다시 메인 큐로 승격시킨다. Frontend는 기존 polling 구조를 유지하되 `QUEUED` 상태를 신규로 표시한다.

**Tech Stack:** Spring Boot 3.5 / Java 21, `spring-boot-starter-data-redis`(Lettuce, `StringRedisTemplate`), Jackson `ObjectMapper`(job 직렬화), 기존 Postgres(`meetings` 테이블), React 19 + TypeScript(frontend).

## Global Constraints

- Redis List 키 이름은 `meeting-analysis` (design doc에서 확정). 재시도 전용 키는 `meeting-analysis:retry`.
- Job payload에는 회의록 원문을 넣지 않는다 — `filePath`/`meetingId` 등 참조만 포함한다 (`document_고무서/WorkFlow_AI_회의록_Redis_Queue_구조.md` "Job Payload 구조" 절).
- 재시도 정책: 최대 3회, 간격 30초 → 1분 → 3분. 초과 시 `failed`로 확정.
- 상태값은 `uploaded`(미사용, 기존과 동일하게 생략 가능) `queued` / `processing` / `completed` / `failed` 5종을 기준으로 하되, 현재 코드가 `uploaded`를 쓰지 않으므로 이번 작업에서도 추가하지 않는다.
- 초기 구현 범위는 `meeting-analysis` 큐 하나 + 재시도 Sorted Set 하나로 한정한다. `meeting-analysis:priority`, `meeting-analysis:dead-letter`는 이번 범위에서 구현하지 않는다 (design doc "초기 구현에서는 meeting-analysis 하나만 사용해도 충분하다").
- Worker는 Spring 내부 Worker 방식(design doc의 "1. Spring 내부 Worker", 초기 추천 방식)을 채택한다.
- 이 작업은 WF-264("Redis Queue 작업 처리 구조 구현", 박지수 담당)의 구현 범위와 겹친다. 실행 전 담당자와 조율할 것 — 이 플랜은 설계 확정 산출물이며, 실행 여부는 팀 확인 후 결정한다.

---

## File Structure

| 파일 | 역할 |
|---|---|
| `App/backend_spring/build.gradle` | `spring-boot-starter-data-redis` 의존성 추가 |
| `App/backend_spring/src/main/resources/application.yml` | `spring.data.redis.host/port` 설정 (기존 `REDIS_HOST` env 재사용) |
| `docs/db/migrations/005_meeting_analysis_queue_columns.sql` | 운영 DB(Supabase) 마이그레이션 |
| `App/backend_spring/src/main/resources/db/init/04_meeting_analysis_queue_columns.sql` | 로컬 fresh volume용 동일 DDL |
| `App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java` | 신규 컬럼 필드/getter/setter 추가 |
| `App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisJob.java` | Redis에 넣는 job payload record (신규) |
| `App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisQueue.java` | Redis List/Sorted Set 기반 enqueue/dequeue/retry 승격 (신규) |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingTextExtractor.java` | 저장된 파일에서 텍스트 재추출 (기존 `MeetingAnalysisService`의 private 메서드 추출, 신규 컴포넌트) |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java` | `markQueued`/`markProcessing`/`markQueuedForRetry` 추가, 성공/실패 저장에 타임스탬프·에러메시지 반영 |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java` | `runAnalysis` 반환 타입을 `void → boolean`으로 변경(성공 여부), `@Async` 제거 |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java` | 삭제 (Worker가 비동기 경계를 대체) |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisWorker.java` | Redis Queue를 소비하는 단일 백그라운드 스레드 Worker (신규) |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java` | `analyze()`/`retry()`가 큐에 enqueue하도록 변경, 상태 매핑에 `QUEUED` 추가 |
| `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java` | Swagger `allowableValues`에 `QUEUED` 추가 |
| `App/backend_spring/src/main/java/com/workflowai/WorkFlowAiBackendApplication.java` | `@EnableScheduling` 추가 (재시도 승격 스케줄러용) |
| `App/backend_spring/src/test/java/com/workflowai/meeting/*Test.java` | 위 변경에 맞춰 갱신 |
| `App/frontend/src/meetings/libs/utils/meetingAiApi.ts` | `MeetingAnalysisStatus`에 `"QUEUED"` 추가 |
| `App/frontend/src/meetings/screen/MeetingsView.tsx` | `QUEUED` 상태 문구("분석 대기 중입니다.") 표시 |

---

### Task 1: Redis 의존성 및 연결 설정

**Files:**
- Modify: `App/backend_spring/build.gradle`
- Modify: `App/backend_spring/src/main/resources/application.yml`

**Interfaces:**
- Produces: Spring Boot 자동 구성 빈 `StringRedisTemplate`(향후 태스크에서 주입해 사용), 프로퍼티 `spring.data.redis.host`/`spring.data.redis.port`.

- [ ] **Step 1: `build.gradle`에 Redis 스타터 추가**

`App/backend_spring/build.gradle`의 `dependencies` 블록에 추가:

```groovy
  implementation 'org.springframework.boot:spring-boot-starter-data-redis'
```

- [ ] **Step 2: `application.yml`에 Redis 연결 프로퍼티 추가**

`App/backend_spring/src/main/resources/application.yml`의 `spring:` 블록 아래(`jpa:` 다음)에 추가:

```yaml
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: ${REDIS_PORT:6379}
```

`docker-compose.yml`의 `backend-spring` 서비스는 이미 `REDIS_HOST: redis`를 주입하고 있으므로 컨테이너 환경에서는 별도 설정 없이 연결된다.

- [ ] **Step 3: 컴파일 확인**

Run: `cd App/backend_spring && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add App/backend_spring/build.gradle App/backend_spring/src/main/resources/application.yml
git commit -m "feat: add Redis dependency and connection config for meeting analysis queue"
```

---

### Task 2: `meetings` 테이블에 Queue 상태 컬럼 추가

**Files:**
- Create: `docs/db/migrations/005_meeting_analysis_queue_columns.sql`
- Create: `App/backend_spring/src/main/resources/db/init/04_meeting_analysis_queue_columns.sql`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java`

**Interfaces:**
- Produces: `Meeting.getAnalysisJobId()/setAnalysisJobId(String)`, `getAnalysisErrorMessage()/setAnalysisErrorMessage(String)`, `getAnalysisStartedAt()/setAnalysisStartedAt(LocalDateTime)`, `getAnalysisCompletedAt()/setAnalysisCompletedAt(LocalDateTime)`, `getAnalysisRetryCount()/setAnalysisRetryCount(Integer)`. 기존 10-인자 생성자는 그대로 유지하고 신규 필드는 생성자 안에서 기본값(`null`/`0`)으로 초기화한다 — 기존 테스트의 `new Meeting(...)` 호출부를 깨지 않기 위함.

- [ ] **Step 1: 운영 DB 마이그레이션 SQL 작성**

`docs/db/migrations/005_meeting_analysis_queue_columns.sql`:

```sql
-- Redis Queue 기반 회의록 분석 상태 추적 컬럼 추가
-- (document_고무서/WorkFlow_AI_회의록_Redis_Queue_구조.md "DB 저장 항목" 절 반영)
-- 적용 대상: 현재 Supabase PostgreSQL (추후 OCI 자체 호스팅 이전 시 동일 스크립트 재실행)
-- 전제: meetings.analysis_status는 이미 존재. 신규 컬럼은 전부 NULL 허용/기본값이라 백필 불필요.

ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS analysis_job_id        VARCHAR(64),
    ADD COLUMN IF NOT EXISTS analysis_error_message TEXT,
    ADD COLUMN IF NOT EXISTS analysis_started_at     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS analysis_completed_at   TIMESTAMP,
    ADD COLUMN IF NOT EXISTS analysis_retry_count    INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN meetings.analysis_job_id IS 'Redis Queue 작업 식별자 (meeting-analysis-{meetingId})';
COMMENT ON COLUMN meetings.analysis_error_message IS '분석 실패 시 사용자에게 보여줄 안전 메시지';
COMMENT ON COLUMN meetings.analysis_started_at IS 'Worker가 처리를 시작한 시각';
COMMENT ON COLUMN meetings.analysis_completed_at IS '분석 성공/최종 실패가 확정된 시각';
COMMENT ON COLUMN meetings.analysis_retry_count IS '현재까지 재시도한 횟수 (최대 3)';
```

- [ ] **Step 2: 로컬 fresh volume용 init 스크립트 작성 (동일 내용)**

`App/backend_spring/src/main/resources/db/init/04_meeting_analysis_queue_columns.sql`에 Step 1과 동일한 내용을 작성한다 (파일 헤더 주석만 "로컬 docker-compose 최초 기동 시 자동 실행"으로 바꾼다).

- [ ] **Step 3: `Meeting` 엔티티에 필드/getter/setter 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java`의 `createdAt` 필드 선언 아래에 추가:

```java
    @Column(name = "analysis_job_id")
    private String analysisJobId;

    @Column(name = "analysis_error_message", columnDefinition = "text")
    private String analysisErrorMessage;

    @Column(name = "analysis_started_at")
    private LocalDateTime analysisStartedAt;

    @Column(name = "analysis_completed_at")
    private LocalDateTime analysisCompletedAt;

    @Column(name = "analysis_retry_count", nullable = false)
    private Integer analysisRetryCount;
```

생성자 본문(`this.createdAt = LocalDateTime.now();` 다음 줄)에 추가:

```java
        this.analysisRetryCount = 0;
```

`getCreatedAt()` 메서드 다음에 추가:

```java
    public String getAnalysisJobId() {
        return analysisJobId;
    }

    public void setAnalysisJobId(String analysisJobId) {
        this.analysisJobId = analysisJobId;
    }

    public String getAnalysisErrorMessage() {
        return analysisErrorMessage;
    }

    public void setAnalysisErrorMessage(String analysisErrorMessage) {
        this.analysisErrorMessage = analysisErrorMessage;
    }

    public LocalDateTime getAnalysisStartedAt() {
        return analysisStartedAt;
    }

    public void setAnalysisStartedAt(LocalDateTime analysisStartedAt) {
        this.analysisStartedAt = analysisStartedAt;
    }

    public LocalDateTime getAnalysisCompletedAt() {
        return analysisCompletedAt;
    }

    public void setAnalysisCompletedAt(LocalDateTime analysisCompletedAt) {
        this.analysisCompletedAt = analysisCompletedAt;
    }

    public Integer getAnalysisRetryCount() {
        return analysisRetryCount;
    }

    public void setAnalysisRetryCount(Integer analysisRetryCount) {
        this.analysisRetryCount = analysisRetryCount;
    }
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd App/backend_spring && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add docs/db/migrations/005_meeting_analysis_queue_columns.sql \
  App/backend_spring/src/main/resources/db/init/04_meeting_analysis_queue_columns.sql \
  App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java
git commit -m "feat: add meeting analysis queue tracking columns"
```

**참고 (운영 반영):** `ddl-auto=validate` 환경에서는 이 마이그레이션을 Supabase에 먼저 수동 적용한 뒤 배포해야 기동이 실패하지 않는다 (기존 `docs/db/migrations/00N_*.sql` 적용 방식과 동일).

---

### Task 3: `MeetingAnalysisJob` payload + `MeetingAnalysisQueue`

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisJob.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisQueue.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/queue/MeetingAnalysisQueueTest.java`

**Interfaces:**
- Consumes: `org.springframework.data.redis.core.StringRedisTemplate`(Spring Boot 자동 구성 빈), `com.fasterxml.jackson.databind.ObjectMapper`(Spring Boot 자동 구성 빈).
- Produces: `MeetingAnalysisJob(String jobId, Long meetingId, String projectId, Long uploadedBy, String sourceType, String filePath, int retryCount, String requestedAt)` record, `MeetingAnalysisJob.withRetryCount(int)`. `MeetingAnalysisQueue.enqueue(MeetingAnalysisJob)`, `MeetingAnalysisQueue.dequeueBlocking(Duration)` → `Optional<MeetingAnalysisJob>`, `MeetingAnalysisQueue.scheduleRetry(MeetingAnalysisJob, Duration)`, `MeetingAnalysisQueue.promoteDueRetries()`(`@Scheduled`).

- [ ] **Step 1: job payload record 작성**

`App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisJob.java`:

```java
package com.workflowai.meeting.queue;

public record MeetingAnalysisJob(
    String jobId,
    Long meetingId,
    String projectId,
    Long uploadedBy,
    String sourceType,
    String filePath,
    int retryCount,
    String requestedAt
) {
    public MeetingAnalysisJob withRetryCount(int newRetryCount) {
        return new MeetingAnalysisJob(jobId, meetingId, projectId, uploadedBy, sourceType, filePath, newRetryCount, requestedAt);
    }
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (enqueue → dequeueBlocking 왕복)**

`App/backend_spring/src/test/java/com/workflowai/meeting/queue/MeetingAnalysisQueueTest.java`:

```java
package com.workflowai.meeting.queue;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisQueueTest {

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private ListOperations<String, String> listOperations;
    @Mock private ZSetOperations<String, String> zSetOperations;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final MeetingAnalysisJob job = new MeetingAnalysisJob(
        "meeting-analysis-1", 1L, "demo-project", 5L, "document", "/uploads/1/notes.txt", 0, "2026-07-21T10:30:00"
    );

    @BeforeEach
    void stubOperations() {
        when(redisTemplate.opsForList()).thenReturn(listOperations);
    }

    private MeetingAnalysisQueue newQueue() {
        return new MeetingAnalysisQueue(redisTemplate, objectMapper);
    }

    @Test
    void enqueuePushesSerializedJobOntoMainList() {
        newQueue().enqueue(job);

        verify(listOperations).leftPush(eq("meeting-analysis"), eq(objectMapper.valueToTree(job).toString()));
    }

    @Test
    void dequeueBlockingReturnsDeserializedJobWhenListHasEntry() {
        String json = objectMapper.valueToTree(job).toString();
        when(listOperations.rightPop("meeting-analysis", Duration.ofSeconds(5))).thenReturn(json);

        Optional<MeetingAnalysisJob> result = newQueue().dequeueBlocking(Duration.ofSeconds(5));

        assertThat(result).contains(job);
    }

    @Test
    void dequeueBlockingReturnsEmptyWhenListHasNoEntryWithinTimeout() {
        when(listOperations.rightPop("meeting-analysis", Duration.ofSeconds(5))).thenReturn(null);

        Optional<MeetingAnalysisJob> result = newQueue().dequeueBlocking(Duration.ofSeconds(5));

        assertThat(result).isEmpty();
    }

    @Test
    void scheduleRetryAddsJobToRetrySortedSetWithFutureScore() {
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);

        newQueue().scheduleRetry(job, Duration.ofSeconds(30));

        verify(zSetOperations).add(eq("meeting-analysis:retry"), any(String.class), anyDouble());
    }

    @Test
    void promoteDueRetriesMovesExpiredEntriesBackToMainList() {
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
        String json = objectMapper.valueToTree(job).toString();
        when(zSetOperations.rangeByScore(eq("meeting-analysis:retry"), eq(0d), any(Double.class)))
            .thenReturn(Set.of(json));

        newQueue().promoteDueRetries();

        verify(zSetOperations).remove("meeting-analysis:retry", json);
        verify(listOperations).leftPush("meeting-analysis", json);
    }
}
```

- [ ] **Step 3: 테스트 실행 → 컴파일 실패(클래스 없음) 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.queue.MeetingAnalysisQueueTest"`
Expected: FAIL — `cannot find symbol: class MeetingAnalysisQueue`

- [ ] **Step 4: `MeetingAnalysisQueue` 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/queue/MeetingAnalysisQueue.java`:

```java
package com.workflowai.meeting.queue;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisQueue {
    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisQueue.class);
    private static final String QUEUE_KEY = "meeting-analysis";
    private static final String RETRY_KEY = "meeting-analysis:retry";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public MeetingAnalysisQueue(StringRedisTemplate redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public void enqueue(MeetingAnalysisJob job) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, writeJson(job));
    }

    public Optional<MeetingAnalysisJob> dequeueBlocking(Duration timeout) {
        String json = redisTemplate.opsForList().rightPop(QUEUE_KEY, timeout);
        return json == null ? Optional.empty() : Optional.of(readJson(json));
    }

    public void scheduleRetry(MeetingAnalysisJob job, Duration delay) {
        double dueAtEpochMillis = Instant.now().plus(delay).toEpochMilli();
        redisTemplate.opsForZSet().add(RETRY_KEY, writeJson(job), dueAtEpochMillis);
    }

    @Scheduled(fixedDelay = 5000)
    public void promoteDueRetries() {
        double now = Instant.now().toEpochMilli();
        Set<String> due = redisTemplate.opsForZSet().rangeByScore(RETRY_KEY, 0, now);
        if (due == null || due.isEmpty()) return;
        for (String json : due) {
            redisTemplate.opsForZSet().remove(RETRY_KEY, json);
            redisTemplate.opsForList().leftPush(QUEUE_KEY, json);
        }
        log.info("Promoted {} meeting analysis job(s) from retry queue", due.size());
    }

    private String writeJson(MeetingAnalysisJob job) {
        try {
            return objectMapper.writeValueAsString(job);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize meeting analysis job: " + job, e);
        }
    }

    private MeetingAnalysisJob readJson(String json) {
        try {
            return objectMapper.readValue(json, MeetingAnalysisJob.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to deserialize meeting analysis job: " + json, e);
        }
    }
}
```

- [ ] **Step 5: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.queue.MeetingAnalysisQueueTest"`
Expected: `BUILD SUCCESSFUL`, 5개 테스트 모두 PASS

- [ ] **Step 6: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/queue/ \
  App/backend_spring/src/test/java/com/workflowai/meeting/queue/
git commit -m "feat: add MeetingAnalysisJob payload and Redis-backed MeetingAnalysisQueue"
```

---

### Task 4: `MeetingTextExtractor` 추출 (기존 로직 재사용을 위한 리팩터)

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingTextExtractor.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingTextExtractorTest.java`

**Interfaces:**
- Produces: `MeetingTextExtractor.extractTextFromStoredFile(Meeting meeting)` → `String`(읽을 수 없으면 `null`, 지원 형식이 아니면 `""`가 아니라 텍스트가 아닌 원본 그대로 — 기존 `MeetingAnalysisService.extractTextFromStoredFile`와 동일한 시맨틱). Task 7(Worker)에서 이 컴포넌트를 재사용한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingTextExtractorTest.java`:

```java
package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class MeetingTextExtractorTest {

    private final MeetingTextExtractor extractor = new MeetingTextExtractor();

    private Meeting meetingWithFile(String filePath, String originalFileName) {
        return new Meeting(1L, "정기회의", "document", filePath, "failed", LocalDate.now(), "정기회의", originalFileName, null, 1L);
    }

    @Test
    void returnsNullWhenMeetingHasNoStoredFilePath() {
        Meeting meeting = meetingWithFile(null, "notes.txt");

        assertThat(extractor.extractTextFromStoredFile(meeting)).isNull();
    }

    @Test
    void readsPlainTextFileContent() throws Exception {
        Path file = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(file, "재분석할 회의 내용");
        Meeting meeting = meetingWithFile(file.toString(), "notes.txt");

        assertThat(extractor.extractTextFromStoredFile(meeting)).isEqualTo("재분석할 회의 내용");

        Files.deleteIfExists(file);
    }

    @Test
    void returnsNullForNonTextExtractableFormatLikeAudio() throws Exception {
        Path file = Files.createTempFile("meeting-audio", ".mp3");
        Files.write(file, new byte[] { 0, 1, 2, 3 });
        Meeting meeting = meetingWithFile(file.toString(), "recording.mp3");

        assertThat(extractor.extractTextFromStoredFile(meeting)).isNull();

        Files.deleteIfExists(file);
    }
}
```

- [ ] **Step 2: 테스트 실행 → 컴파일 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingTextExtractorTest"`
Expected: FAIL — `cannot find symbol: class MeetingTextExtractor`

- [ ] **Step 3: `MeetingAnalysisService`의 기존 private 메서드를 그대로 옮겨 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingTextExtractor.java` (내용은 `MeetingAnalysisService.java`의 `extractTextFromStoredFile`/`extractDocxTextFromBytes`를 그대로 이동):

```java
package com.workflowai.meeting;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.springframework.stereotype.Component;

@Component
public class MeetingTextExtractor {

    public String extractTextFromStoredFile(Meeting meeting) {
        String filePath = meeting.getFilePath();
        if (filePath == null || filePath.isBlank()) return null;
        String fileName = meeting.getOriginalFileName() == null ? "" : meeting.getOriginalFileName().toLowerCase();
        boolean textLike = fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv") || fileName.endsWith(".json");
        try {
            byte[] bytes = Files.readAllBytes(Path.of(filePath));
            if (fileName.endsWith(".docx")) {
                return extractDocxTextFromBytes(bytes);
            }
            if (!textLike) {
                return null;
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private String extractDocxTextFromBytes(byte[] bytes) {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!"word/document.xml".equals(entry.getName())) continue;
                String xml = new String(zip.readAllBytes(), StandardCharsets.UTF_8);
                return xml
                    .replaceAll("<w:p[^>]*>", "\n")
                    .replaceAll("<[^>]+>", " ")
                    .replace("&lt;", "<")
                    .replace("&gt;", ">")
                    .replace("&amp;", "&")
                    .replace("&quot;", "\"")
                    .replace("&apos;", "'")
                    .replaceAll("\\s+", " ")
                    .trim();
            }
        } catch (IOException ignored) {
            return "";
        }
        return "";
    }
}
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingTextExtractorTest"`
Expected: `BUILD SUCCESSFUL`, 3개 테스트 PASS

- [ ] **Step 5: `MeetingAnalysisService`에서 중복 제거 — 새 컴포넌트로 위임**

`MeetingAnalysisService.java`에서:
1. 생성자 파라미터에 `MeetingTextExtractor meetingTextExtractor` 추가, 필드 저장.
2. `private String extractTextFromStoredFile(Meeting meeting) { ... }`와 `private String extractDocxTextFromBytes(byte[] bytes) { ... }` 메서드를 **삭제**.
3. `retry()` 메서드 안의 `String text = extractTextFromStoredFile(meeting);` 호출을 `String text = meetingTextExtractor.extractTextFromStoredFile(meeting);`로 변경.

(`extractText(MultipartFile file)`와 `extractDocxText(MultipartFile file)`는 업로드 즉시 처리용으로 별개 — 그대로 유지한다.)

- [ ] **Step 6: 기존 서비스 테스트의 생성자 호출부 갱신**

`MeetingAnalysisServiceTest.java`의 `newService()`에 `MeetingTextExtractor` 목을 추가해야 하지만, 이 변경은 Task 8에서 `MeetingAnalysisQueue` 주입과 함께 한 번에 정리한다 (지금 단계에서는 컴파일이 깨진 채로 두지 않도록, `newService()` 마지막 인자 앞에 `new MeetingTextExtractor()`를 직접 추가):

```java
    private MeetingAnalysisService newService() {
        return new MeetingAnalysisService(
            meetingAnalysisRunner, demoDataService, meetingRepository, meetingAttendeeRepository,
            meetingAnalysisRepository, meetingActionItemRepository, taskRepository, notificationRepository,
            userRepository, projectMemberRepository, ragIngestService, meetingAnalysisPersistence,
            new MeetingTextExtractor(), "/tmp/workflow-uploads"
        );
    }
```

(mock이 아니라 실제 인스턴스를 사용 — 순수 파일 IO 로직이라 목 처리할 이유가 없다.)

- [ ] **Step 7: 전체 회의록 테스트 실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.*"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 8: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingTextExtractor.java \
  App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingTextExtractorTest.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java
git commit -m "refactor: extract MeetingTextExtractor for reuse by the analysis worker"
```

---

### Task 5: `MeetingAnalysisPersistence` — queue 상태 전이 메서드 추가

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java`
- Modify: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisPersistenceTest.java`

**Interfaces:**
- Consumes: `Meeting`의 Task 2 신규 setter들.
- Produces: `markQueued(Long meetingId, String jobId)`, `markProcessing(Long meetingId, String jobId)`, `markQueuedForRetry(Long meetingId, int retryCount)`. `saveAnalysisSuccess`/`saveAnalysisFailure`는 시그니처 변경 없이 내부에서 타임스탬프/에러메시지를 추가로 저장한다.

- [ ] **Step 1: 실패하는 테스트 작성 (기존 테스트 파일에 추가)**

`MeetingAnalysisPersistenceTest.java`에 추가:

```java
    @Test
    void markQueuedSetsStatusAndJobId() {
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisPersistence persistence = newPersistence();

        persistence.markQueued(1L, "meeting-analysis-1");

        assertThat(meeting.getAnalysisStatus()).isEqualTo("queued");
        assertThat(meeting.getAnalysisJobId()).isEqualTo("meeting-analysis-1");
        verify(meetingRepository).save(meeting);
    }

    @Test
    void markProcessingSetsStatusJobIdAndStartedAt() {
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisPersistence persistence = newPersistence();

        persistence.markProcessing(1L, "meeting-analysis-1");

        assertThat(meeting.getAnalysisStatus()).isEqualTo("processing");
        assertThat(meeting.getAnalysisStartedAt()).isNotNull();
    }

    @Test
    void markQueuedForRetrySetsStatusBackToQueuedAndIncrementsRetryCount() {
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisPersistence persistence = newPersistence();

        persistence.markQueuedForRetry(1L, 1);

        assertThat(meeting.getAnalysisStatus()).isEqualTo("queued");
        assertThat(meeting.getAnalysisRetryCount()).isEqualTo(1);
    }

    @Test
    void saveAnalysisFailureStoresErrorMessageAndCompletedAt() {
        Meeting meeting = newMeeting();
        when(meetingRepository.findById(1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisPersistence persistence = newPersistence();

        persistence.saveAnalysisFailure(1L, "분석 중 오류가 발생했습니다.");

        assertThat(meeting.getAnalysisStatus()).isEqualTo("failed");
        assertThat(meeting.getAnalysisErrorMessage()).isEqualTo("분석 중 오류가 발생했습니다.");
        assertThat(meeting.getAnalysisCompletedAt()).isNotNull();
    }
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisPersistenceTest"`
Expected: FAIL — `markQueued`/`markProcessing`/`markQueuedForRetry` 메서드 없음, `saveAnalysisFailure`가 `analysisErrorMessage`를 저장하지 않아 assertion 실패.

- [ ] **Step 3: `MeetingAnalysisPersistence`에 메서드 추가/수정**

`saveAnalysisSuccess` 메서드 마지막 부분(`meeting.setAnalysisStatus("completed");` 다음 줄)에 추가:

```java
        meeting.setAnalysisCompletedAt(java.time.LocalDateTime.now());
```

`saveAnalysisFailure`를 다음으로 교체:

```java
    @Transactional
    public void saveAnalysisFailure(Long meetingId, String errorMessage) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("failed");
            meeting.setAnalysisErrorMessage(errorMessage);
            meeting.setAnalysisCompletedAt(java.time.LocalDateTime.now());
            meetingRepository.save(meeting);
        });
    }
```

파일 하단(마지막 private 메서드 다음)에 추가:

```java
    @Transactional
    public void markQueued(Long meetingId, String jobId) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("queued");
            meeting.setAnalysisJobId(jobId);
            meetingRepository.save(meeting);
        });
    }

    @Transactional
    public void markProcessing(Long meetingId, String jobId) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("processing");
            meeting.setAnalysisJobId(jobId);
            meeting.setAnalysisStartedAt(java.time.LocalDateTime.now());
            meetingRepository.save(meeting);
        });
    }

    @Transactional
    public void markQueuedForRetry(Long meetingId, int retryCount) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("queued");
            meeting.setAnalysisRetryCount(retryCount);
            meetingRepository.save(meeting);
        });
    }
```

(파일 상단 `import java.time.LocalDate;` 옆에 `import java.time.LocalDateTime;`을 추가하고 위 코드의 `java.time.LocalDateTime.now()`를 `LocalDateTime.now()`로 정리해도 무방하다.)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisPersistenceTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisPersistenceTest.java
git commit -m "feat: add queue state transitions to MeetingAnalysisPersistence"
```

---

### Task 6: `MeetingAnalysisRunner` — 성공/실패를 반환값으로 노출

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java`
- Delete: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java`
- Modify: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisRunnerTest.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/WorkFlowAiBackendApplication.java`

**Interfaces:**
- Produces: `MeetingAnalysisRunner.runAnalysis(Long meetingId, AiAnalyzeRequest request)` → `boolean`(성공 시 `true`). Task 7의 `MeetingAnalysisWorker`가 이 반환값으로 재시도 여부를 결정한다.

- [ ] **Step 1: 기존 테스트에 반환값 검증 추가**

`MeetingAnalysisRunnerTest.java`의 각 테스트에서 `newRunner().runAnalysis(9L, request);` 호출부를 결과를 담는 형태로 바꾼다:

```java
    @Test
    void savesSuccessWithFastApiSourceWhenFastApiSucceeds() {
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenReturn(result);

        boolean success = newRunner().runAnalysis(9L, request);

        assertThat(success).isTrue();
        verify(meetingAnalysisPersistence).saveAnalysisSuccess(9L, result, "FASTAPI");
        verify(meetingAnalysisPersistence, never()).saveAnalysisFailure(any(), any());
    }
```

나머지 두 테스트(`fallsBackToSpringAnalyzerWhenFastApiThrows`, `savesFailureWhenBothFastApiAndFallbackThrow`)도 동일하게 `boolean success = newRunner().runAnalysis(9L, request);`로 바꾸고, 첫 번째는 `assertThat(success).isTrue();`, 두 번째는 `assertThat(success).isFalse();`를 추가한다. 파일 상단 import에 `import static org.assertj.core.api.Assertions.assertThat;` 추가.

- [ ] **Step 2: 테스트 실행 → 컴파일 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisRunnerTest"`
Expected: FAIL — `runAnalysis`가 아직 `void`라 `boolean success = ...` 대입 불가.

- [ ] **Step 3: `MeetingAnalysisRunner` 수정**

`MeetingAnalysisRunner.java`를 다음으로 교체:

```java
package com.workflowai.meeting;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisRunner {
    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisRunner.class);

    private final FastApiMeetingClient fastApiMeetingClient;
    private final FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    private final MeetingAnalysisPersistence meetingAnalysisPersistence;

    public MeetingAnalysisRunner(
        FastApiMeetingClient fastApiMeetingClient,
        FallbackMeetingAnalyzer fallbackMeetingAnalyzer,
        MeetingAnalysisPersistence meetingAnalysisPersistence
    ) {
        this.fastApiMeetingClient = fastApiMeetingClient;
        this.fallbackMeetingAnalyzer = fallbackMeetingAnalyzer;
        this.meetingAnalysisPersistence = meetingAnalysisPersistence;
    }

    /** 회의록 분석을 실행하고 DB에 결과를 저장한다. 호출부(Worker)의 스레드에서 동기로 실행된다. */
    public boolean runAnalysis(Long meetingId, AiAnalyzeRequest request) {
        MeetingAnalysisResult result;
        String analysisSource;
        try {
            MeetingAnalysisResult fastApiResult;
            try {
                fastApiResult = fastApiMeetingClient.analyze(request);
            } catch (Exception e) {
                log.warn("FastAPI meeting analysis failed. meetingId={}, fallback=SPRING_FALLBACK", meetingId, e);
                fastApiResult = null;
            }
            if (fastApiResult != null) {
                result = fastApiResult;
                analysisSource = "FASTAPI";
            } else {
                result = fallbackMeetingAnalyzer.analyze(request);
                analysisSource = "SPRING_FALLBACK";
            }
        } catch (Exception e) {
            log.warn("Meeting analysis failed after FastAPI/fallback attempts. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE);
            return false;
        }

        try {
            meetingAnalysisPersistence.saveAnalysisSuccess(meetingId, result, analysisSource);
            return true;
        } catch (Exception e) {
            log.warn("Meeting analysis persistence failed. meetingId={}", meetingId, e);
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE);
            return false;
        }
    }
}
```

(`@Async("meetingAnalysisExecutor")` 어노테이션과 관련 import를 제거했다 — 비동기 경계는 이제 `MeetingAnalysisWorker`의 전용 스레드가 담당한다.)

- [ ] **Step 4: `MeetingAnalysisAsyncConfig` 삭제**

```bash
rm App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java
```

- [ ] **Step 5: 스케줄러 활성화**

`WorkFlowAiBackendApplication.java`에 `@EnableScheduling` 추가 (Task 3의 `promoteDueRetries()`가 동작하려면 필요):

```java
package com.workflowai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class WorkFlowAiBackendApplication {
    public static void main(String[] args) {
        DatabaseUrlPropertyMapper.apply();
        SpringApplication.run(WorkFlowAiBackendApplication.class, args);
    }
}
```

- [ ] **Step 6: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisRunnerTest"`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java \
  App/backend_spring/src/main/java/com/workflowai/WorkFlowAiBackendApplication.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisRunnerTest.java
git rm App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java
git commit -m "refactor: MeetingAnalysisRunner returns success/failure, drop @Async in favor of the queue worker"
```

---

### Task 7: `MeetingAnalysisWorker` — Redis Queue 소비 백그라운드 스레드

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisWorker.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisWorkerTest.java`

**Interfaces:**
- Consumes: `MeetingAnalysisQueue.dequeueBlocking/scheduleRetry`(Task 3), `MeetingTextExtractor.extractTextFromStoredFile`(Task 4), `MeetingAnalysisPersistence.markProcessing/markQueuedForRetry/saveAnalysisFailure`(Task 5), `MeetingAnalysisRunner.runAnalysis(Long, AiAnalyzeRequest): boolean`(Task 6), `MeetingRepository`, `MeetingAttendeeRepository`, `UserRepository`.
- Produces: `MeetingAnalysisWorker.processJob(MeetingAnalysisJob job)` — package-private, 단위 테스트 대상. 스레드 시작/중지(`start()`/`stop()`)는 `@PostConstruct`/`@PreDestroy`로 연결되며 이번 태스크에서는 단위 테스트하지 않는다(실제 스레드 통합은 Task 8 완료 후 `docker compose up`으로 수동 검증).

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisWorkerTest.java`:

```java
package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.meeting.queue.MeetingAnalysisJob;
import com.workflowai.meeting.queue.MeetingAnalysisQueue;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisWorkerTest {

    @Mock private MeetingAnalysisQueue meetingAnalysisQueue;
    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAttendeeRepository meetingAttendeeRepository;
    @Mock private UserRepository userRepository;
    @Mock private MeetingAnalysisRunner meetingAnalysisRunner;
    @Mock private MeetingAnalysisPersistence meetingAnalysisPersistence;

    private final MeetingTextExtractor meetingTextExtractor = new MeetingTextExtractor();

    private MeetingAnalysisWorker newWorker() {
        return new MeetingAnalysisWorker(
            meetingAnalysisQueue, meetingRepository, meetingAttendeeRepository, userRepository,
            meetingTextExtractor, meetingAnalysisRunner, meetingAnalysisPersistence
        );
    }

    @Test
    void processJobSkipsWhenMeetingNoLongerExists() {
        MeetingAnalysisJob job = new MeetingAnalysisJob("j1", 99L, "demo-project", 5L, "document", "/x.txt", 0, "2026-07-21T10:00:00");
        when(meetingRepository.findById(99L)).thenReturn(Optional.empty());

        newWorker().processJob(job);

        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
    }

    @Test
    void processJobMarksReuploadFailureWhenFileMissing() {
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "queued", LocalDate.now(), "정기회의", "notes.txt", 5L, 1L);
        MeetingAnalysisJob job = new MeetingAnalysisJob("j1", 10L, "demo-project", 5L, "document", null, 0, "2026-07-21T10:00:00");
        when(meetingRepository.findById(10L)).thenReturn(Optional.of(meeting));

        newWorker().processJob(job);

        verify(meetingAnalysisPersistence).saveAnalysisFailure(10L, MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
    }

    @Test
    void processJobBuildsRequestFromStoredFileAndRunsAnalysis() throws Exception {
        Path file = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(file, "회의 내용 원문");
        Meeting meeting = new Meeting(1L, "7차 정기회의", "document", file.toString(), "queued", LocalDate.now(), "정기회의", "notes.txt", 5L, 1L);
        MeetingAnalysisJob job = new MeetingAnalysisJob("j1", 11L, "demo-project", 5L, "document", file.toString(), 0, "2026-07-21T10:00:00");
        when(meetingRepository.findById(11L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(11L)).thenReturn(List.of(new MeetingAttendee(11L, 2L)));
        User attendee = org.mockito.Mockito.mock(User.class);
        when(attendee.getName()).thenReturn("이서연");
        when(userRepository.findById(2L)).thenReturn(Optional.of(attendee));
        when(meetingAnalysisRunner.runAnalysis(eq(11L), any(AiAnalyzeRequest.class))).thenReturn(true);

        newWorker().processJob(job);

        verify(meetingAnalysisPersistence).markProcessing(11L, "j1");
        ArgumentCaptor<AiAnalyzeRequest> captor = ArgumentCaptor.forClass(AiAnalyzeRequest.class);
        verify(meetingAnalysisRunner).runAnalysis(eq(11L), captor.capture());
        assertThat(captor.getValue().text()).isEqualTo("회의 내용 원문");
        assertThat(captor.getValue().participants()).containsExactly("이서연");
        verify(meetingAnalysisQueue, never()).scheduleRetry(any(), any());

        Files.deleteIfExists(file);
    }

    @Test
    void processJobSchedulesRetryWhenAnalysisFailsAndRetriesRemain() throws Exception {
        Path file = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(file, "회의 내용 원문");
        Meeting meeting = new Meeting(1L, "정기회의", "document", file.toString(), "queued", LocalDate.now(), "정기회의", "notes.txt", 5L, 1L);
        MeetingAnalysisJob job = new MeetingAnalysisJob("j1", 12L, "demo-project", 5L, "document", file.toString(), 0, "2026-07-21T10:00:00");
        when(meetingRepository.findById(12L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(12L)).thenReturn(List.of());
        when(meetingAnalysisRunner.runAnalysis(eq(12L), any(AiAnalyzeRequest.class))).thenReturn(false);

        newWorker().processJob(job);

        verify(meetingAnalysisPersistence).markQueuedForRetry(12L, 1);
        verify(meetingAnalysisQueue).scheduleRetry(eq(job.withRetryCount(1)), eq(Duration.ofSeconds(30)));

        Files.deleteIfExists(file);
    }

    @Test
    void processJobDoesNotRetryWhenMaxRetriesExhausted() throws Exception {
        Path file = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(file, "회의 내용 원문");
        Meeting meeting = new Meeting(1L, "정기회의", "document", file.toString(), "queued", LocalDate.now(), "정기회의", "notes.txt", 5L, 1L);
        MeetingAnalysisJob job = new MeetingAnalysisJob("j1", 13L, "demo-project", 5L, "document", file.toString(), 3, "2026-07-21T10:00:00");
        when(meetingRepository.findById(13L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(13L)).thenReturn(List.of());
        when(meetingAnalysisRunner.runAnalysis(eq(13L), any(AiAnalyzeRequest.class))).thenReturn(false);

        newWorker().processJob(job);

        verify(meetingAnalysisQueue, never()).scheduleRetry(any(), any());
        verify(meetingAnalysisPersistence, never()).markQueuedForRetry(any(), any(Integer.class));

        Files.deleteIfExists(file);
    }
}
```

- [ ] **Step 2: 테스트 실행 → 컴파일 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisWorkerTest"`
Expected: FAIL — `cannot find symbol: class MeetingAnalysisWorker`

- [ ] **Step 3: `MeetingAnalysisWorker` 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisWorker.java`:

```java
package com.workflowai.meeting;

import com.workflowai.meeting.queue.MeetingAnalysisJob;
import com.workflowai.meeting.queue.MeetingAnalysisQueue;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisWorker {
    private static final Logger log = LoggerFactory.getLogger(MeetingAnalysisWorker.class);
    private static final Duration POLL_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration[] RETRY_DELAYS = { Duration.ofSeconds(30), Duration.ofSeconds(60), Duration.ofSeconds(180) };
    private static final int MAX_RETRIES = 3;

    private final MeetingAnalysisQueue meetingAnalysisQueue;
    private final MeetingRepository meetingRepository;
    private final MeetingAttendeeRepository meetingAttendeeRepository;
    private final UserRepository userRepository;
    private final MeetingTextExtractor meetingTextExtractor;
    private final MeetingAnalysisRunner meetingAnalysisRunner;
    private final MeetingAnalysisPersistence meetingAnalysisPersistence;

    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> new Thread(r, "meeting-analysis-worker"));
    private volatile boolean running = false;

    public MeetingAnalysisWorker(
        MeetingAnalysisQueue meetingAnalysisQueue,
        MeetingRepository meetingRepository,
        MeetingAttendeeRepository meetingAttendeeRepository,
        UserRepository userRepository,
        MeetingTextExtractor meetingTextExtractor,
        MeetingAnalysisRunner meetingAnalysisRunner,
        MeetingAnalysisPersistence meetingAnalysisPersistence
    ) {
        this.meetingAnalysisQueue = meetingAnalysisQueue;
        this.meetingRepository = meetingRepository;
        this.meetingAttendeeRepository = meetingAttendeeRepository;
        this.userRepository = userRepository;
        this.meetingTextExtractor = meetingTextExtractor;
        this.meetingAnalysisRunner = meetingAnalysisRunner;
        this.meetingAnalysisPersistence = meetingAnalysisPersistence;
    }

    @PostConstruct
    void start() {
        running = true;
        executor.submit(this::pollLoop);
    }

    @PreDestroy
    void stop() {
        running = false;
        executor.shutdownNow();
    }

    private void pollLoop() {
        while (running) {
            try {
                meetingAnalysisQueue.dequeueBlocking(POLL_TIMEOUT).ifPresent(this::processJob);
            } catch (Exception e) {
                log.warn("Meeting analysis worker loop error", e);
            }
        }
    }

    void processJob(MeetingAnalysisJob job) {
        Meeting meeting = meetingRepository.findById(job.meetingId()).orElse(null);
        if (meeting == null) {
            log.warn("Meeting analysis job references missing meeting. meetingId={}", job.meetingId());
            return;
        }

        String text = meetingTextExtractor.extractTextFromStoredFile(meeting);
        if (text == null) {
            meetingAnalysisPersistence.saveAnalysisFailure(job.meetingId(), MeetingAnalysisPersistence.REUPLOAD_REQUIRED_ERROR_MESSAGE);
            return;
        }
        if (text.isBlank()) {
            meetingAnalysisPersistence.saveAnalysisFailure(job.meetingId(), MeetingAnalysisPersistence.REUPLOAD_READ_ERROR_MESSAGE);
            return;
        }

        List<String> participantNames = meetingAttendeeRepository.findByMeetingId(job.meetingId()).stream()
            .map(attendee -> userRepository.findById(attendee.getUserId()).map(User::getName).orElse(null))
            .filter(name -> name != null)
            .toList();

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            job.projectId(),
            meeting.getTitle(),
            meeting.getMeetingDate() == null ? LocalDate.now().toString() : meeting.getMeetingDate().toString(),
            meeting.getMeetingType() == null ? "정기회의" : meeting.getMeetingType(),
            job.sourceType(),
            meeting.getOriginalFileName(),
            text,
            participantNames
        );

        meetingAnalysisPersistence.markProcessing(job.meetingId(), job.jobId());
        boolean success = meetingAnalysisRunner.runAnalysis(job.meetingId(), request);
        if (!success && job.retryCount() < MAX_RETRIES) {
            int nextRetryCount = job.retryCount() + 1;
            MeetingAnalysisJob nextAttempt = job.withRetryCount(nextRetryCount);
            meetingAnalysisPersistence.markQueuedForRetry(job.meetingId(), nextRetryCount);
            meetingAnalysisQueue.scheduleRetry(nextAttempt, RETRY_DELAYS[job.retryCount()]);
        }
    }
}
```

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisWorkerTest"`
Expected: `BUILD SUCCESSFUL`, 5개 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisWorker.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisWorkerTest.java
git commit -m "feat: add MeetingAnalysisWorker consuming the Redis meeting-analysis queue"
```

---

### Task 8: `MeetingAnalysisService` — enqueue로 전환 + `QUEUED` 상태 노출

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java`
- Modify: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`

**Interfaces:**
- Consumes: `MeetingAnalysisQueue.enqueue(MeetingAnalysisJob)`(Task 3), `MeetingAnalysisPersistence.markQueued`(Task 5).
- Produces: `MeetingAnalysisService.analyze(...)`/`retry(...)`가 `status="queued"`로 저장 후 큐에 enqueue. `find()`/`findStatus()`가 `"queued"→"QUEUED"`를 매핑하고 실패 메시지를 `meeting.getAnalysisErrorMessage()`에서 읽는다.

- [ ] **Step 1: 기존 테스트를 새 동작에 맞춰 갱신 (실패하는 상태로 먼저 작성)**

`MeetingAnalysisServiceTest.java` 수정:

1. Mock 필드 추가: `@Mock private com.workflowai.meeting.queue.MeetingAnalysisQueue meetingAnalysisQueue;`
2. `newService()`에 `meetingAnalysisQueue` 인자 추가 (Task 4에서 추가한 `MeetingTextExtractor` 다음 자리):

```java
    private MeetingAnalysisService newService() {
        return new MeetingAnalysisService(
            meetingAnalysisRunner, demoDataService, meetingRepository, meetingAttendeeRepository,
            meetingAnalysisRepository, meetingActionItemRepository, taskRepository, notificationRepository,
            userRepository, projectMemberRepository, ragIngestService, meetingAnalysisPersistence,
            new MeetingTextExtractor(), meetingAnalysisQueue, "/tmp/workflow-uploads"
        );
    }
```

3. `analyzeSavesMeetingAsProcessingAndReturnsImmediately` 테스트를 다음으로 교체(이름도 변경):

```java
    @Test
    void analyzeSavesMeetingAsQueuedAndReturnsImmediately() {
        mockMember(1L);
        MeetingAnalysisService service = newService();
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        MeetingAnalysisResponse response = service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준"), null
        );

        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(response.analysis()).isNull();
        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository, atLeastOnce()).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getAllValues().get(0).getAnalysisStatus()).isEqualTo("queued");
        verify(meetingAnalysisQueue).enqueue(any(com.workflowai.meeting.queue.MeetingAnalysisJob.class));
        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
    }
```

4. `retryTransitionsFailedMeetingBackToProcessing`을 다음으로 교체(이름도 변경):

```java
    @Test
    void retryTransitionsFailedMeetingBackToQueued() throws Exception {
        mockMember(1L);
        Path textFile = Files.createTempFile("meeting-notes", ".txt");
        Files.writeString(textFile, "재분석할 회의 내용");
        Meeting meeting = new Meeting(1L, "정기회의", "document", textFile.toString(), "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(4L, 1L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(4L)).thenReturn(List.of());
        MeetingAnalysisService service = newService();

        MeetingAnalysisResponse response = service.retry("demo-project", "4");

        assertThat(response.status()).isEqualTo("QUEUED");
        assertThat(meeting.getAnalysisStatus()).isEqualTo("queued");
        verify(meetingAnalysisQueue).enqueue(any(com.workflowai.meeting.queue.MeetingAnalysisJob.class));
        verify(meetingAnalysisRunner, never()).runAnalysis(any(), any());
        Files.deleteIfExists(textFile);
    }
```

5. `findUsesConsistentProjectIdAndFileTypeForProcessingAndCompletedResponses`에서 `assertThat(processing.status()).isEqualTo("PROCESSING");`은 그대로 두되(초기 Meeting fixture의 `analysisStatus`가 `"processing"`이므로 유지), 아래 새 테스트를 추가해 `queued` 매핑을 별도 검증:

```java
    @Test
    void findMapsQueuedStatusToQueuedResponse() {
        mockMember(1L);
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "queued", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findByIdAndProjectId(20L, 1L)).thenReturn(Optional.of(meeting));
        MeetingAnalysisService service = newService();

        assertThat(service.find("demo-project", "20").status()).isEqualTo("QUEUED");
    }
```

- [ ] **Step 2: 테스트 실행 → 컴파일/실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest"`
Expected: FAIL — `MeetingAnalysisService` 생성자에 `MeetingAnalysisQueue` 인자가 없어 컴파일 에러.

- [ ] **Step 3: `MeetingAnalysisService` 수정**

생성자에 필드/파라미터 추가 (`meetingAnalysisPersistence` 필드 선언부 근처):

```java
    private final MeetingAnalysisQueue meetingAnalysisQueue;
```

생성자 시그니처에 `MeetingAnalysisQueue meetingAnalysisQueue` 파라미터를 `meetingTextExtractor` 다음, `uploadsDir` 이전에 추가하고 본문에 `this.meetingAnalysisQueue = meetingAnalysisQueue;` 대입을 추가한다. (import 추가: `import com.workflowai.meeting.queue.MeetingAnalysisJob;`, `import com.workflowai.meeting.queue.MeetingAnalysisQueue;`, `import java.time.Instant;`, `import java.util.UUID;`)

`analyze()` 메서드 안의 다음 블록을 교체한다.

기존:
```java
        Meeting meeting = meetingRepository.save(new Meeting(
            projectDbId,
            resolvedTitle,
            resolvedSourceType,
            null,
            "processing",
            LocalDate.parse(resolvedDate),
            meetingKind,
            fileName,
            null,
            file == null ? null : file.getSize()
        ));
```

신규:
```java
        Meeting meeting = meetingRepository.save(new Meeting(
            projectDbId,
            resolvedTitle,
            resolvedSourceType,
            null,
            "queued",
            LocalDate.parse(resolvedDate),
            meetingKind,
            fileName,
            null,
            file == null ? null : file.getSize()
        ));
```

이어서 `runAnalysisAfterCommit(meeting.getId(), request);` 호출부와 `private void runAnalysisAfterCommit(...)` 메서드 전체를 삭제하고, 그 자리(`AiAnalyzeRequest request = ...;` 블록 다음)에 아래 코드로 대체한다:

```java
        String jobId = "meeting-analysis-" + meeting.getId();
        MeetingAnalysisJob job = new MeetingAnalysisJob(
            jobId, meeting.getId(), projectId, CurrentUser.id(), resolvedSourceType,
            meeting.getFilePath(), 0, Instant.now().toString()
        );
        enqueueAfterCommit(meeting.getId(), jobId, job);
```

`private void runAnalysisAfterCommit(Long meetingId, AiAnalyzeRequest request) { ... }` 메서드를 아래로 교체한다:

```java
    private void enqueueAfterCommit(Long meetingId, String jobId, MeetingAnalysisJob job) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            meetingAnalysisQueue.enqueue(job);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                meetingAnalysisQueue.enqueue(job);
            }
        });
    }
```

`retry()` 메서드의 마지막 블록을 교체한다.

기존:
```java
        meeting.setAnalysisStatus("processing");
        meetingRepository.save(meeting);

        meetingAnalysisRunner.runAnalysis(id, request);

        return new MeetingAnalysisResponse(
            meetingId,
            toResponseProjectId(meeting.getProjectId()),
            "PROCESSING",
            meeting.getFileType(),
            meeting.getOriginalFileName(),
            null,
            null,
            null,
            buildAttendeeSummaries(id, meeting.getProjectId())
        );
```

신규:
```java
        meeting.setAnalysisStatus("queued");
        meetingRepository.save(meeting);

        String jobId = "meeting-analysis-" + id;
        meetingAnalysisQueue.enqueue(new MeetingAnalysisJob(
            jobId, id, toResponseProjectId(meeting.getProjectId()), meeting.getUploadedBy(),
            defaultString(meeting.getFileType(), "document"), meeting.getFilePath(), 0, Instant.now().toString()
        ));

        return new MeetingAnalysisResponse(
            meetingId,
            toResponseProjectId(meeting.getProjectId()),
            "QUEUED",
            meeting.getFileType(),
            meeting.getOriginalFileName(),
            null,
            null,
            null,
            buildAttendeeSummaries(id, meeting.getProjectId())
        );
```

(`retry()` 앞부분에서 `AiAnalyzeRequest request = new AiAnalyzeRequest(...)`를 만들던 블록과 `participantNames` 계산 블록은 더 이상 필요 없다 — 실제 요청 조립은 Worker가 담당한다. 해당 블록을 삭제한다. 단, `retry()` 앞부분의 REUPLOAD 실패 처리(파일이 없거나 빈 경우 즉시 FAILED 반환)는 그대로 유지한다 — 이 부분은 `meetingTextExtractor.extractTextFromStoredFile(meeting)` 호출로 이미 Task 4에서 위임 완료된 상태다.)

`find()`의 처리중/실패 분기를 교체한다.

기존:
```java
        if (!"completed".equals(meeting.getAnalysisStatus())) {
            String status = "failed".equals(meeting.getAnalysisStatus()) ? "FAILED" : "PROCESSING";
            String errorMessage = "FAILED".equals(status)
                ? MeetingAnalysisPersistence.DEFAULT_ANALYSIS_ERROR_MESSAGE
                : null;
```

신규:
```java
        if (!"completed".equals(meeting.getAnalysisStatus())) {
            String status = switch (meeting.getAnalysisStatus()) {
                case "failed" -> "FAILED";
                case "queued" -> "QUEUED";
                default -> "PROCESSING";
            };
            String errorMessage = "FAILED".equals(status) ? meeting.getAnalysisErrorMessage() : null;
```

`findStatus()`를 교체한다:

```java
    public MeetingStatusResponse findStatus(String projectId, String meetingId) {
        Meeting meeting = requireProjectMeeting(projectId, meetingId);
        if (meeting == null) return null;
        String status = switch (meeting.getAnalysisStatus()) {
            case "completed" -> "COMPLETED";
            case "failed" -> "FAILED";
            case "queued" -> "QUEUED";
            default -> "PROCESSING";
        };
        String errorMessage = "FAILED".equals(status) ? meeting.getAnalysisErrorMessage() : null;
        return new MeetingStatusResponse(meetingId, status, errorMessage);
    }
```

- [ ] **Step 4: `MeetingStatusResponse` Swagger 문서 갱신**

`MeetingStatusResponse.java`의 `@Schema` allowableValues에 `"QUEUED"` 추가:

```java
    @Schema(description = "분석 상태", example = "QUEUED", allowableValues = {"QUEUED", "PROCESSING", "COMPLETED", "FAILED"}) String status,
```

- [ ] **Step 5: 테스트 재실행 → 전체 통과 확인**

Run: `cd App/backend_spring && ./gradlew test`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 6: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java \
  App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java \
  App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java
git commit -m "feat: enqueue meeting analysis jobs instead of running them inline, expose QUEUED status"
```

---

### Task 9: Frontend — `QUEUED` 상태 표시

**Files:**
- Modify: `App/frontend/src/meetings/libs/utils/meetingAiApi.ts`
- Modify: `App/frontend/src/meetings/screen/MeetingsView.tsx`

**Interfaces:**
- Consumes: 백엔드가 새로 반환하는 `status: "QUEUED"`.
- Produces: `MeetingAnalysisStatus`에 `"QUEUED"` 추가, 대기 화면 문구 "분석 대기 중입니다."

- [ ] **Step 1: 타입에 `QUEUED` 추가**

`App/frontend/src/meetings/libs/utils/meetingAiApi.ts`:

```ts
export type MeetingAnalysisStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
```

- [ ] **Step 2: 폴링 화면에서 `QUEUED`/`PROCESSING` 문구 분기**

`App/frontend/src/meetings/screen/MeetingsView.tsx`에서 폴링 결과 상태를 화면 문구로 매핑하는 부분을 찾는다:

Run: `grep -n "PROCESSING\|분석 중" App/frontend/src/meetings/screen/MeetingsView.tsx`

기존에 `"분석 중입니다"`류 고정 문구를 렌더링하던 지점에서, 상태값이 `"QUEUED"`이면 `"분석 대기 중입니다."`, `"PROCESSING"`이면 기존 문구(`"회의록을 분석 중입니다."`)를 보여주도록 조건을 추가한다. 예:

```tsx
{analysisStatus === "QUEUED" ? "분석 대기 중입니다." : "회의록을 분석 중입니다."}
```

(정확한 삽입 위치는 위 `grep` 결과의 JSX 구조에 맞춰 결정한다 — 기존 로딩 애니메이션/스피너 컴포넌트는 그대로 재사용하고 문구만 상태에 따라 바꾼다.)

- [ ] **Step 3: 타입 체크**

Run: `cd App/frontend && pnpm tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인**

`docker compose up -d backend-fastapi backend-spring frontend db redis kafka` 실행 후 브라우저에서 회의록 업로드 → 짧게 "분석 대기 중입니다." 문구가 보였다가 "회의록을 분석 중입니다."로 바뀌고 완료되는지 확인한다. (Worker가 큐를 매우 빠르게 소비하므로 QUEUED 문구는 순간적으로만 보일 수 있다 — 이는 정상 동작이다.)

- [ ] **Step 5: Commit**

```bash
git add App/frontend/src/meetings/libs/utils/meetingAiApi.ts App/frontend/src/meetings/screen/MeetingsView.tsx
git commit -m "feat: show QUEUED status label while meeting analysis waits in the queue"
```

---

## 범위 밖 (명시적 제외)

- `meeting-analysis:priority`, `meeting-analysis:dead-letter` 큐 — design doc이 초기 구현에서 불필요하다고 명시.
- FastAPI/별도 Worker 서비스로의 이전 — design doc의 3안(장기 추천)은 이번 범위 밖.
- Redis 장애 시 폴백(예: Redis 다운 시 기존 `@Async` 경로로 되돌아가는 하이브리드 모드) — 필요 시 별도 플랜으로 분리.
- WF-264의 다른 팀원 작업 범위(회의록 외 다른 도메인에 큐 재사용) 및 `document_고무서/2026-07-21-redis-caching-candidates.md`에서 검토한 **캐싱** 후보(기여도 리포트 LLM 요약, 워크로드 스코어, Spring 대시보드 집계) — 해당 문서에서 "지금은 구현하지 않는다"로 결론남, 이번 플랜과 무관.
- 실제 LLM 분석 품질/프롬프트 개선, 업무보드 DB 완전 연동 (기존 `2026-07-15-meeting-ai-async-polling-design.md`와 동일하게 범위 밖).
