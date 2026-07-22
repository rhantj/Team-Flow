# RAG 개인화 기능 잔여 한계 해소 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RAG 개인화 기능의 남은 두 가지 한계 — (1) 정규식 기반 개인 의도 판별의 표현 누락, (2) 담당자 동기화 실패 시 복구 경로 없음 — 을 해소한다.

**Architecture:** (A) FastAPI `chat_service.py`의 정규식/토큰 목록을 확장. (B) Spring `RagIngestService.syncAssigneeBestEffort`에 `spring-retry`의 `@Retryable`/`@Recover`를 적용해, 재시도 소진 시 신규 `rag_assignee_sync_failures` 테이블에 실패 기록을 남긴다.

**Tech Stack:** FastAPI/Python(pytest), Spring Boot/Java 21(JUnit5, Mockito, spring-retry, spring-boot-starter-aop), PostgreSQL(수동 마이그레이션, `docs/db/migrations/`)

## Global Constraints

- 설계 문서: `document_고무서/2026-07-22-rag-personalization-gap-fixes-design.md` (승인됨)
- 재시도 실패 후 재실행(replay) 경로는 이번 범위에서 제외 — 기록만 남긴다
- 담당 청크 없을 시 프로젝트 전체 폴백 문제는 이미 해결되어 있어 범위에서 제외
- 마이그레이션 파일은 이번에 커밋하되, 실제 Supabase 적용은 별도로 사용자 확인 후 진행한다 (DB 스키마 변경은 CLAUDE.md상 확인 후 실행 대상)
- git 커밋은 사용자가 명시적으로 요청할 때만 수행한다 (CLAUDE.md)

---

### Task 1: 개인 의도 판별 정규식 확장 (FastAPI)

**Files:**
- Modify: `App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py:26-28`
- Test: `App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py`

**Interfaces:**
- Consumes: 없음 (기존 `_is_personal_intent(question: str) -> bool` 시그니처 그대로 유지)
- Produces: `_is_personal_intent`의 판별 정확도만 개선. 호출부(`answer_question`)는 변경 없음

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py`에 다음 테스트를 추가한다 (파일 상단에 이미 `from llm_rag_assistant.app.services.chat_service import _is_personal_intent, answer_question`가 있으므로 import 추가 불필요):

```python
@pytest.mark.parametrize(
    "question",
    [
        "내가할일줘",
        "제가맡은거 뭐야",
        "todo 알려줘",
        "task 목록 보여줘",
    ],
)
def test_is_personal_intent_detects_particle_attached_compact_forms(question: str) -> None:
    assert _is_personal_intent(question) is True


@pytest.mark.parametrize(
    "question",
    [
        "내년 계획 알려줘",
        "내용 요약해줘",
        "제안서 검토해줘",
        "제출 기한이 언제야",
    ],
)
def test_is_personal_intent_particle_pattern_does_not_false_positive(question: str) -> None:
    assert _is_personal_intent(question) is False
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/llm_rag_assistant/test_chat_service.py -k "particle_attached or particle_pattern" -v`
Expected: FAIL — `test_is_personal_intent_detects_particle_attached_compact_forms`의 각 파라미터 케이스가 `assert False is True`로 실패 (현재 패턴은 "내가할일줘"의 "내" 뒤에 조사 "가"가 있어 lookahead가 명사에 바로 붙지 않으므로 매치 안 됨; "todo"/"task"는 명사 목록에 없음)

- [ ] **Step 3: 최소 구현 작성**

`App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py:26-28`을 다음으로 교체:

```python
# "내업무", "제할일"처럼 조사/공백 없이 붙여 쓴 압축형은 위 토큰 정확 일치로 못 잡는다.
# "내"/"제"를 그냥 접두사로 허용하면 "내용", "내년", "제안", "제출" 같은 무관 단어까지 오탐하므로,
# 담당 업무를 가리키는 명사가 바로 뒤에 붙을 때만(=단어 시작 위치) 개인화 의도로 인정한다.
# "내가할일줘"처럼 명사 앞에 조사(가/는/이)가 공백 없이 붙는 경우도 있어, "내"/"제" 뒤에
# 단일 조사 한 글자를 선택적으로 허용한다.
_COMPACT_PERSONAL_TASK_PATTERN = re.compile(
    r"(?:^|[\s\"'“‘\(\[{])(?:내|제)(?:가|는|이)?"
    r"(?=업무|담당|맡|할\s?일|일감|태스크|일|건|리스트|목록|todo|task|꺼|것)"
)
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `cd App/backend_fastapi && python -m pytest tests/llm_rag_assistant/test_chat_service.py -v`
Expected: PASS — 전체 테스트(기존 30개 + 신규 8개 파라미터 케이스) 통과. 특히 기존 오탐 방지 테스트(`test_is_personal_intent_compact_pattern_does_not_false_positive` 등)가 계속 통과하는지 확인 — `일`을 lookahead에 추가했으므로 "일요일", "일단" 같은 단어가 새로 오탐되지 않는지 아래 Step 5에서 추가 검증한다.

- [ ] **Step 5: `일` 확장으로 인한 오탐 여부 회귀 테스트 추가**

`test_chat_service.py`에 추가:

```python
@pytest.mark.parametrize(
    "question",
    [
        "일요일에 회의 있어?",
        "일단 확인해볼게",
        "제일 중요한 건 뭐야",
    ],
)
def test_is_personal_intent_il_suffix_does_not_false_positive(question: str) -> None:
    assert _is_personal_intent(question) is False
```

Run: `cd App/backend_fastapi && python -m pytest tests/llm_rag_assistant/test_chat_service.py -k "il_suffix" -v`
Expected: PASS. ("일요일"은 "내"/"제"로 시작하지 않아 애초에 매치 대상이 아니고, "제일"은 "제" 뒤에 "일"이 바로 붙지만 lookahead가 매치되어 오탐 위험이 있음 — 만약 FAIL하면 Step 3의 `일` 앞에 경계 조건을 추가하거나 `일` 항목을 제거하고 `건|리스트|목록|todo|task`만 유지하도록 되돌린다.)

- [ ] **Step 6: Step 5 결과에 따라 필요 시 패턴 조정**

Step 5에서 "제일 중요한 건 뭐야"가 오탐(`True`)으로 나오면, "제" 뒤에 조사 없이 바로 "일"이 붙는 경우("제일")를 걸러야 한다. 이 경우 Step 3의 패턴에서 `일` 단독 항목을 제거하고 더 구체적인 표현으로 좁힌다:

```python
_COMPACT_PERSONAL_TASK_PATTERN = re.compile(
    r"(?:^|[\s\"'“‘\(\[{])(?:내|제)(?:가|는|이)?"
    r"(?=업무|담당|맡|할\s?일|일감|태스크|건|리스트|목록|todo|task|꺼|것)"
)
```

(`일` 단독 대신 `할\s?일`처럼 이미 있는 복합 표현에만 의존하고, "task 목록"류는 `목록`으로 이미 커버됨) 이 경우 Step 1의 "task 목록 보여줘" 테스트는 `목록`으로 매치되므로 영향 없다. 조정 후 Step 4, 5를 재실행해 전체 통과를 재확인한다.

- [ ] **Step 7: Commit**

```bash
cd /Users/gomuseo/Desktop/Python/Work-Flow
git add App/backend_fastapi/llm_rag_assistant/app/services/chat_service.py App/backend_fastapi/tests/llm_rag_assistant/test_chat_service.py
git commit -m "feat: 개인 의도 판별 압축형/조사 결합 표현 인식 확장"
```

---

### Task 2: `rag_assignee_sync_failures` 테이블 + 엔티티/레포지토리 추가 (Spring)

**Files:**
- Create: `docs/db/migrations/009_rag_assignee_sync_failures.sql`
- Create: `App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailure.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailureRepository.java`

**Interfaces:**
- Produces: `RagAssigneeSyncFailure` 엔티티(생성자: `RagAssigneeSyncFailure(Long projectId, String sourceType, Long sourceId, Long assigneeId, String errorMessage)`)와 `RagAssigneeSyncFailureRepository extends JpaRepository<RagAssigneeSyncFailure, Long>` — Task 3에서 `RagIngestService`가 소비

- [ ] **Step 1: 마이그레이션 SQL 작성**

`docs/db/migrations/009_rag_assignee_sync_failures.sql`:

```sql
CREATE TABLE IF NOT EXISTS rag_assignee_sync_failures (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id BIGINT NOT NULL,
  assignee_id BIGINT,
  error_message TEXT,
  failed_at TIMESTAMP NOT NULL
);
```

이 파일은 이번 Task에서 커밋만 하고, 실제 Supabase 적용은 사용자 확인 후 별도로 진행한다.

- [ ] **Step 2: JPA 엔티티 작성**

`App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailure.java`:

```java
package com.workflowai.rag;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

@Entity
@Table(name = "rag_assignee_sync_failures")
public class RagAssigneeSyncFailure {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "source_type", nullable = false)
    private String sourceType;

    @Column(name = "source_id", nullable = false)
    private Long sourceId;

    @Column(name = "assignee_id")
    private Long assigneeId;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    @Column(name = "failed_at", nullable = false)
    private LocalDateTime failedAt;

    protected RagAssigneeSyncFailure() {
    }

    public RagAssigneeSyncFailure(Long projectId, String sourceType, Long sourceId, Long assigneeId, String errorMessage) {
        this.projectId = projectId;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.assigneeId = assigneeId;
        this.errorMessage = errorMessage;
        this.failedAt = LocalDateTime.now();
    }

    public Long getId() {
        return id;
    }

    public Long getProjectId() {
        return projectId;
    }

    public String getSourceType() {
        return sourceType;
    }

    public Long getSourceId() {
        return sourceId;
    }

    public Long getAssigneeId() {
        return assigneeId;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public LocalDateTime getFailedAt() {
        return failedAt;
    }
}
```

- [ ] **Step 3: 레포지토리 작성**

`App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailureRepository.java`:

```java
package com.workflowai.rag;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RagAssigneeSyncFailureRepository extends JpaRepository<RagAssigneeSyncFailure, Long> {
}
```

- [ ] **Step 4: 컴파일 확인**

Run: `cd App/backend_spring && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: Commit**

```bash
cd /Users/gomuseo/Desktop/Python/Work-Flow
git add docs/db/migrations/009_rag_assignee_sync_failures.sql \
  App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailure.java \
  App/backend_spring/src/main/java/com/workflowai/rag/RagAssigneeSyncFailureRepository.java
git commit -m "feat: RAG 담당자 동기화 실패 기록 테이블/엔티티 추가"
```

---

### Task 3: `spring-retry` 의존성 및 `@EnableRetry` 설정 추가

**Files:**
- Modify: `App/backend_spring/build.gradle`
- Create: `App/backend_spring/src/main/java/com/workflowai/common/RetryConfig.java`

**Interfaces:**
- Consumes: 없음
- Produces: `@EnableRetry`가 적용된 애플리케이션 컨텍스트 — Task 4의 `@Retryable`/`@Recover`가 이 설정에 의존

- [ ] **Step 1: 의존성 추가**

`App/backend_spring/build.gradle`의 `dependencies` 블록에 `implementation 'org.apache.pdfbox:pdfbox:3.0.4'` 다음 줄로 추가:

```groovy
  implementation 'org.springframework.retry:spring-retry'
  implementation 'org.springframework.boot:spring-boot-starter-aop'
```

- [ ] **Step 2: RetryConfig 작성**

`App/backend_spring/src/main/java/com/workflowai/common/RetryConfig.java`:

```java
package com.workflowai.common;

import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;

@Configuration
@EnableRetry
public class RetryConfig {
}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd App/backend_spring && ./gradlew compileJava`
Expected: BUILD SUCCESSFUL (의존성 다운로드 후 컴파일 성공)

- [ ] **Step 4: Commit**

```bash
cd /Users/gomuseo/Desktop/Python/Work-Flow
git add App/backend_spring/build.gradle App/backend_spring/src/main/java/com/workflowai/common/RetryConfig.java
git commit -m "chore: spring-retry 의존성 및 @EnableRetry 설정 추가"
```

---

### Task 4: `RagIngestService.syncAssigneeBestEffort`에 재시도/복구 적용

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/rag/RagIngestService.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/rag/RagIngestServiceRetryTest.java` (신규)

**Interfaces:**
- Consumes: `RagAssigneeSyncFailureRepository`(Task 2), `@EnableRetry` 설정(Task 3), 기존 `FastApiRagClient.syncAssignee(RagAssigneeSyncRequest)`
- Produces: `RagIngestService`의 새 생성자 시그니처 `RagIngestService(FastApiRagClient, RagAssigneeSyncFailureRepository)` — 다른 곳에서 `new RagIngestService(...)`로 직접 생성하는 코드가 없는지 Step 1에서 확인 후 진행

- [ ] **Step 1: 기존 생성자 사용처 확인**

Run: `cd /Users/gomuseo/Desktop/Python/Work-Flow && grep -rn "new RagIngestService(" App/backend_spring/src`
Expected: 결과 없음 (Spring이 `@Service`로 자동 생성/주입하므로 수동 생성 코드가 없어야 함). 만약 결과가 있으면 해당 호출부도 함께 수정 대상에 추가한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/rag/RagIngestServiceRetryTest.java`:

```java
package com.workflowai.rag;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.context.TestPropertySource;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.client.RestClientException;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = RagIngestServiceRetryTest.RetryTestConfig.class)
@TestPropertySource(properties = {
    "rag.assignee-sync.retry.delay-ms=1",
    "rag.assignee-sync.retry.multiplier=1"
})
class RagIngestServiceRetryTest {

    @Autowired
    private RagIngestService ragIngestService;

    @Autowired
    private FastApiRagClient fastApiRagClient;

    @Autowired
    private RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository;

    @BeforeEach
    void setUp() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository);
    }

    @AfterEach
    void tearDown() {
        reset(fastApiRagClient, ragAssigneeSyncFailureRepository);
    }

    @Test
    void syncAssigneeRetriesAndSucceedsWithinAttemptLimit() {
        doThrow(new RestClientException("boom"))
            .doThrow(new RestClientException("boom"))
            .doNothing()
            .when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        verify(fastApiRagClient, times(3)).syncAssignee(any());
        verifyNoInteractions(ragAssigneeSyncFailureRepository);
    }

    @Test
    void syncAssigneeRecordsFailureAfterExhaustingRetries() {
        doThrow(new RestClientException("boom")).when(fastApiRagClient).syncAssignee(any());

        ragIngestService.syncAssigneeBestEffort(1L, "task", 10L, 99L);

        verify(fastApiRagClient, times(3)).syncAssignee(any());
        ArgumentCaptor<RagAssigneeSyncFailure> captor = ArgumentCaptor.forClass(RagAssigneeSyncFailure.class);
        verify(ragAssigneeSyncFailureRepository).save(captor.capture());
        RagAssigneeSyncFailure saved = captor.getValue();
        assertThat(saved.getProjectId()).isEqualTo(1L);
        assertThat(saved.getSourceType()).isEqualTo("task");
        assertThat(saved.getSourceId()).isEqualTo(10L);
        assertThat(saved.getAssigneeId()).isEqualTo(99L);
        assertThat(saved.getErrorMessage()).contains("boom");
    }

    @Configuration
    @EnableRetry
    static class RetryTestConfig {
        @Bean
        FastApiRagClient fastApiRagClient() {
            return mock(FastApiRagClient.class);
        }

        @Bean
        RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository() {
            return mock(RagAssigneeSyncFailureRepository.class);
        }

        @Bean
        RagIngestService ragIngestService(FastApiRagClient client, RagAssigneeSyncFailureRepository repo) {
            return new RagIngestService(client, repo);
        }
    }
}
```

- [ ] **Step 3: 테스트 실행하여 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.rag.RagIngestServiceRetryTest"`
Expected: FAIL — 컴파일 에러(`RagIngestService(FastApiRagClient, RagAssigneeSyncFailureRepository)` 생성자가 아직 없음, `syncAssigneeBestEffort` 호출 시 재시도 동작 없음)

- [ ] **Step 4: 최소 구현 작성**

`App/backend_spring/src/main/java/com/workflowai/rag/RagIngestService.java` 전체를 다음으로 교체:

```java
package com.workflowai.rag;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

// RAG 임베딩은 어시스턴트 답변 품질을 높이는 부가 기능이라, FastAPI 장애나 지연이
// 회의록/업무 저장 흐름(호출 스레드)을 막지 않도록 별도 스레드에서 처리하고 예외를 삼킨다.
@Service
public class RagIngestService {
    private static final Logger log = LoggerFactory.getLogger(RagIngestService.class);

    private final FastApiRagClient fastApiRagClient;
    private final RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository;

    public RagIngestService(FastApiRagClient fastApiRagClient, RagAssigneeSyncFailureRepository ragAssigneeSyncFailureRepository) {
        this.fastApiRagClient = fastApiRagClient;
        this.ragAssigneeSyncFailureRepository = ragAssigneeSyncFailureRepository;
    }

    @Async("ragIngestExecutor")
    public void ingestBestEffort(Long projectId, String sourceType, Long sourceId, String content) {
        ingestBestEffort(projectId, sourceType, sourceId, content, null);
    }

    @Async("ragIngestExecutor")
    public void ingestBestEffort(Long projectId, String sourceType, Long sourceId, String content, Long assigneeId) {
        if (projectId == null || sourceId == null || content == null || content.isBlank()) return;
        try {
            fastApiRagClient.ingest(new RagIngestRequest(projectId, sourceType, sourceId, content, assigneeId));
        } catch (Exception e) {
            log.warn("RAG ingest 실패 (무시): sourceType={}, sourceId={}", sourceType, sourceId, e);
        }
    }

    // 담당자만 재배정된 경우(내용 변경 없음) - 이미 인제스트된 청크를 재임베딩하지 않고
    // assignee_id 메타데이터만 갱신한다. RAG 인제스트 자체가 안 됐던 소스(source_id)라면
    // FastAPI 쪽 UPDATE가 0건에 그칠 뿐이라 안전하다.
    // 일시적 장애(네트워크, FastAPI 재시작 등)에 대비해 지수 백오프로 최대 3회 재시도하고,
    // 그래도 실패하면 recoverSyncAssignee가 실패 기록만 남기고 예외를 삼킨다 (호출 스레드에
    // 영향 없어야 하므로 최종적으로도 예외를 던지지 않는다).
    @Async("ragIngestExecutor")
    @Retryable(
        retryFor = Exception.class,
        maxAttempts = 3,
        backoff = @Backoff(
            delayExpression = "${rag.assignee-sync.retry.delay-ms:1000}",
            multiplierExpression = "${rag.assignee-sync.retry.multiplier:2}"
        )
    )
    public void syncAssigneeBestEffort(Long projectId, String sourceType, Long sourceId, Long assigneeId) {
        if (projectId == null || sourceId == null) return;
        fastApiRagClient.syncAssignee(new RagAssigneeSyncRequest(projectId, sourceType, sourceId, assigneeId));
    }

    @Recover
    public void recoverSyncAssignee(Exception e, Long projectId, String sourceType, Long sourceId, Long assigneeId) {
        log.warn("RAG assignee 동기화 재시도 모두 실패, 기록 저장: sourceType={}, sourceId={}", sourceType, sourceId, e);
        ragAssigneeSyncFailureRepository.save(
            new RagAssigneeSyncFailure(projectId, sourceType, sourceId, assigneeId, e.getMessage())
        );
    }
}
```

주의: `projectId == null || sourceId == null`인 경우 그냥 `return`하므로 `@Retryable`이 적용된 메서드가 예외 없이 정상 종료된다 — 재시도 대상이 아니다 (원래 동작 유지).

- [ ] **Step 5: 테스트 실행하여 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.rag.RagIngestServiceRetryTest"`
Expected: PASS — 두 테스트 모두 통과. (`@TestPropertySource`로 재시도 간격을 1ms로 낮춰 테스트가 수 초씩 걸리지 않도록 함)

- [ ] **Step 6: 전체 Spring 테스트 회귀 확인**

Run: `cd App/backend_spring && ./gradlew test`
Expected: BUILD SUCCESSFUL — 기존 `RagControllerTest`, `RagControllerSecurityTest` 등 포함 전체 통과. 특히 `RagIngestService`를 직접 생성하는 다른 테스트가 있다면 생성자 시그니처 변경으로 컴파일 에러가 나는지 확인하고, 있다면 Task 4 Step 1에서 놓친 사용처이므로 함께 수정한다.

- [ ] **Step 7: Commit**

```bash
cd /Users/gomuseo/Desktop/Python/Work-Flow
git add App/backend_spring/src/main/java/com/workflowai/rag/RagIngestService.java \
  App/backend_spring/src/test/java/com/workflowai/rag/RagIngestServiceRetryTest.java
git commit -m "feat: 담당자 동기화 실패 시 지수 백오프 재시도 및 실패 기록"
```

---

### Task 5: 문서 정리

**Files:**
- Modify: `document_고무서/2026-07-22-rag-personalization-gap-fixes-design.md`

**Interfaces:**
- Consumes: Task 1~4의 최종 구현 결과
- Produces: 없음 (문서 갱신만)

- [ ] **Step 1: 설계 문서에 구현 결과 반영**

`document_고무서/2026-07-22-rag-personalization-gap-fixes-design.md` 말미에 다음 섹션을 추가한다:

```markdown
## 구현 결과 (2026-07-22)

- Task 1: `_COMPACT_PERSONAL_TASK_PATTERN`에 조사 결합형(`가|는|이`)과 `맡|건|리스트|목록|todo|task` 추가로 완료
- Task 2~4: `spring-retry` 기반 재시도(최대 3회, 지수 백오프) + `rag_assignee_sync_failures` 실패 기록 테이블로 완료
- 마이그레이션 009는 코드 커밋만 완료, Supabase 실적용은 [별도 확인 후 진행 / 완료 — 날짜 기입]
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gomuseo/Desktop/Python/Work-Flow
git add document_고무서/2026-07-22-rag-personalization-gap-fixes-design.md
git commit -m "docs: RAG 개인화 잔여 한계 해소 구현 결과 기록"
```
