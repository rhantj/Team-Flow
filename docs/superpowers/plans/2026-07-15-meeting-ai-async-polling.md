# 회의록 AI 비동기 분석 + 상태 폴링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의록 업로드 시 즉시 `meetingId`를 반환하고 실제 AI 분석은 백그라운드에서 실행되도록 바꾸며, 프론트는 서버 상태를 폴링해 `processing/completed/failed`를 반영하고 실패 시 재시도할 수 있게 한다.

**Architecture:** Spring `@Async` self-invocation 문제를 피하기 위해 `MeetingAnalysisService`(동기 진입점) → `MeetingAnalysisRunner`(`@Async`, FastAPI/fallback 호출) → `MeetingAnalysisPersistence`(`@Transactional` 저장)의 3개 빈으로 분리한다(순환 의존 없음). 프론트는 기존 가짜 progress 애니메이션을 90%에서 멈추고, 실제 완료/실패 판단은 새 polling이 담당한다.

**Tech Stack:** Spring Boot(Gradle, Java), JPA/Hibernate, JUnit 5 + Mockito + AssertJ, React + TypeScript + Vite(pnpm).

## Global Constraints

- Railway 배포 설정, `DatabaseUrlPropertyMapper`, Docker 설정은 수정하지 않는다.
- 업무보드 DB 완전 연동, 실제 LLM 품질 개선은 범위 밖이다.
- `ddl-auto: validate`이므로 새 컬럼은 SQL 마이그레이션 파일로만 추가하고, 실제 DB 반영은 이 작업 범위에서 하지 않는다(사용자가 별도로 적용).
- polling 간격은 1.5~3초, 여기서는 2초로 구현한다.
- 기존 UI 스타일(className, 색상)은 최대한 재사용한다.

---

### Task 1: 스키마/엔티티/Executor 스캐폴딩

**Files:**
- Create: `App/backend_spring/src/main/resources/db/init/03_meeting_ai_async_status.sql`
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendee.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendeeRepository.java`

**Interfaces:**
- Produces: `Meeting.getAnalysisErrorMessage()/setAnalysisErrorMessage(String)`, `Meeting.getFileType()`, `MeetingAttendee.getMeetingId()/getUserId()`, `MeetingAttendeeRepository.findByMeetingId(Long): List<MeetingAttendee>`, bean `meetingAnalysisExecutor`.

- [ ] **Step 1: 마이그레이션 SQL 작성**

`App/backend_spring/src/main/resources/db/init/03_meeting_ai_async_status.sql`:

```sql
-- ============================================================================
-- WorkFlow AI - 회의록 AI 비동기 분석 상태 확장 (2026-07-15)
-- 02_meeting_ai_additions.sql 이후 실행. analysis_status가 failed일 때
-- 실패 사유를 저장하기 위한 컬럼을 추가한다.
-- ============================================================================

ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS analysis_error_message TEXT;

COMMENT ON COLUMN meetings.analysis_error_message IS '분석 실패(failed) 시 실패 사유 (FastAPI/fallback 예외 메시지)';
```

- [ ] **Step 2: `Meeting` 엔티티에 필드/getter 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java`의 `getOriginalFileName()`과 `getCreatedAt()` 사이(파일 끝 `}` 앞)에 아래 3개 메서드와 1개 필드를 추가한다.

필드 추가 (`private String originalFileName;` 아래, `uploadedBy` 필드 위):
```java
    @Column(name = "analysis_error_message", columnDefinition = "text")
    private String analysisErrorMessage;
```

getter/setter 추가 (`getOriginalFileName()` 메서드 뒤):
```java
    public String getFileType() {
        return fileType;
    }

    public String getAnalysisErrorMessage() {
        return analysisErrorMessage;
    }

    public void setAnalysisErrorMessage(String analysisErrorMessage) {
        this.analysisErrorMessage = analysisErrorMessage;
    }
```

- [ ] **Step 3: `MeetingAttendee`에 getter 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendee.java`의 `getId()` 메서드 뒤에 추가:

```java
    public Long getMeetingId() {
        return meetingId;
    }

    public Long getUserId() {
        return userId;
    }
```

- [ ] **Step 4: `MeetingAttendeeRepository`에 조회 메서드 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendeeRepository.java` 전체를 아래로 교체:

```java
package com.workflowai.meeting;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MeetingAttendeeRepository extends JpaRepository<MeetingAttendee, Long> {
    List<MeetingAttendee> findByMeetingId(Long meetingId);
}
```

- [ ] **Step 5: 비동기 Executor 설정 클래스 작성**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java` 신규 작성:

```java
package com.workflowai.meeting;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
@EnableAsync
public class MeetingAnalysisAsyncConfig {

    @Bean(name = "meetingAnalysisExecutor")
    public Executor meetingAnalysisExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("meeting-analysis-");
        executor.initialize();
        return executor;
    }
}
```

- [ ] **Step 6: 컴파일 확인**

Run: `cd App/backend_spring && ./gradlew compileJava`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 7: Commit**

```bash
git add App/backend_spring/src/main/resources/db/init/03_meeting_ai_async_status.sql \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisAsyncConfig.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/Meeting.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendee.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAttendeeRepository.java
git commit -m "feat: 회의록 비동기 분석을 위한 스키마/엔티티/Executor 추가"
```

---

### Task 2: `MeetingAnalysisPersistence` (성공/실패 저장, 별도 트랜잭션)

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisPersistenceTest.java`

**Interfaces:**
- Consumes: `MeetingRepository`, `MeetingAnalysisRepository`, `MeetingActionItemRepository`, `UserRepository`, `DemoDataService`(기존 클래스, 시그니처 변경 없음). `Meeting.getAnalysisErrorMessage/setAnalysisErrorMessage`(Task 1).
- Produces: `saveAnalysisSuccess(Long meetingId, MeetingAnalysisResult result, String analysisSource): void`, `saveAnalysisFailure(Long meetingId, String errorMessage): void` — Task 3(`MeetingAnalysisRunner`)이 이 두 메서드를 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisPersistenceTest.java`:

```java
package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisPersistenceTest {

    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAnalysisRepository meetingAnalysisRepository;
    @Mock private MeetingActionItemRepository meetingActionItemRepository;
    @Mock private UserRepository userRepository;
    @Mock private DemoDataService demoDataService;

    private MeetingAnalysisPersistence newPersistence() {
        return new MeetingAnalysisPersistence(
            meetingRepository, meetingAnalysisRepository, meetingActionItemRepository, userRepository, demoDataService
        );
    }

    @Test
    void saveAnalysisSuccessMarksMeetingCompletedAndStoresTodos() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(5L)).thenReturn(Optional.of(meeting));

        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약",
            List.of("결정1"),
            List.of(new MeetingTodo("업무1", "설명", "김민준", null, "2026-07-20", "HIGH", "ETC", true)),
            List.of("위험1"),
            List.of("키워드1"),
            new MeetingMeta("정기회의", "2026-07-15", List.of("김민준"))
        );

        persistence.saveAnalysisSuccess(5L, result, "FASTAPI");

        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getValue().getAnalysisStatus()).isEqualTo("completed");
        verify(meetingAnalysisRepository).save(any(MeetingAnalysis.class));
        verify(meetingActionItemRepository).save(any(MeetingActionItem.class));
    }

    @Test
    void saveAnalysisFailureMarksMeetingFailedWithMessage() {
        MeetingAnalysisPersistence persistence = newPersistence();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "processing", LocalDate.now(), "정기회의", "a.txt", null, 10L);
        when(meetingRepository.findById(7L)).thenReturn(Optional.of(meeting));

        persistence.saveAnalysisFailure(7L, "FastAPI 연결 실패");

        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getValue().getAnalysisStatus()).isEqualTo("failed");
        assertThat(meetingCaptor.getValue().getAnalysisErrorMessage()).isEqualTo("FastAPI 연결 실패");
    }
}
```

- [ ] **Step 2: 테스트 실패 확인 (컴파일 에러 - 클래스 없음)**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisPersistenceTest"`
Expected: FAIL — `MeetingAnalysisPersistence` 클래스가 없어 컴파일 에러

- [ ] **Step 3: `MeetingAnalysisPersistence` 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java` 신규 작성:

```java
package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MeetingAnalysisPersistence {
    private final MeetingRepository meetingRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final UserRepository userRepository;
    private final DemoDataService demoDataService;

    public MeetingAnalysisPersistence(
        MeetingRepository meetingRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        UserRepository userRepository,
        DemoDataService demoDataService
    ) {
        this.meetingRepository = meetingRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.userRepository = userRepository;
        this.demoDataService = demoDataService;
    }

    @Transactional
    public void saveAnalysisSuccess(Long meetingId, MeetingAnalysisResult result, String analysisSource) {
        Meeting meeting = meetingRepository.findById(meetingId).orElseThrow(
            () -> new IllegalStateException("Meeting not found: " + meetingId));

        meetingAnalysisRepository.save(new MeetingAnalysis(
            meetingId, result.summary(), result.decisions(), result.risks(), result.keywords(), analysisSource
        ));

        for (MeetingTodo todo : result.todos()) {
            meetingActionItemRepository.save(new MeetingActionItem(
                meetingId,
                todo.title(),
                todo.description(),
                todo.category(),
                resolveAssigneeByName(todo.assignee_candidate()),
                resolveAssignee(todo.assignee_id()),
                parseDateOrNull(todo.due_date()),
                todo.priority(),
                null
            ));
        }

        meeting.setAnalysisStatus("completed");
        meeting.setAnalysisErrorMessage(null);
        meetingRepository.save(meeting);
    }

    @Transactional
    public void saveAnalysisFailure(Long meetingId, String errorMessage) {
        meetingRepository.findById(meetingId).ifPresent(meeting -> {
            meeting.setAnalysisStatus("failed");
            meeting.setAnalysisErrorMessage(errorMessage);
            meetingRepository.save(meeting);
        });
    }

    private Long resolveAssigneeByName(String name) {
        if (name == null || name.isBlank()) return null;
        return userRepository.findFirstByName(name).map(User::getId).orElse(null);
    }

    private Long resolveAssignee(String assigneeIdParam) {
        if (assigneeIdParam == null || assigneeIdParam.isBlank()) return null;
        Long resolved = demoDataService.resolveUserId(assigneeIdParam);
        if (resolved != null) return resolved;
        try {
            return Long.parseLong(assigneeIdParam);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return null;
        }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisPersistenceTest"`
Expected: `BUILD SUCCESSFUL`, 2 tests passed

- [ ] **Step 5: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisPersistence.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisPersistenceTest.java
git commit -m "feat: 분석 성공/실패를 별도 트랜잭션으로 저장하는 MeetingAnalysisPersistence 추가"
```

---

### Task 3: `MeetingAnalysisRunner` (`@Async` 분석 실행)

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisRunnerTest.java`

**Interfaces:**
- Consumes: `FastApiMeetingClient.analyze(AiAnalyzeRequest): MeetingAnalysisResult`(기존), `FallbackMeetingAnalyzer.analyze(AiAnalyzeRequest): MeetingAnalysisResult`(기존), `MeetingAnalysisPersistence.saveAnalysisSuccess/saveAnalysisFailure`(Task 2).
- Produces: `runAnalysis(Long meetingId, AiAnalyzeRequest request): void`(`@Async("meetingAnalysisExecutor")`) — Task 4(`MeetingAnalysisService`)가 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisRunnerTest.java`:

```java
package com.workflowai.meeting;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisRunnerTest {

    @Mock private FastApiMeetingClient fastApiMeetingClient;
    @Mock private FallbackMeetingAnalyzer fallbackMeetingAnalyzer;
    @Mock private MeetingAnalysisPersistence meetingAnalysisPersistence;

    private final AiAnalyzeRequest request = new AiAnalyzeRequest(
        "demo-project", "정기회의", "2026-07-15", "정기회의", "document", "a.txt", "내용", List.of("김민준")
    );

    private MeetingAnalysisRunner newRunner() {
        return new MeetingAnalysisRunner(fastApiMeetingClient, fallbackMeetingAnalyzer, meetingAnalysisPersistence);
    }

    @Test
    void savesSuccessWithFastApiSourceWhenFastApiSucceeds() {
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenReturn(result);

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisSuccess(9L, result, "FASTAPI");
        verify(meetingAnalysisPersistence, never()).saveAnalysisFailure(any(), any());
    }

    @Test
    void fallsBackToSpringAnalyzerWhenFastApiThrows() {
        MeetingAnalysisResult fallbackResult = new MeetingAnalysisResult(
            "요약", List.of(), List.of(), List.of(), List.of(), new MeetingMeta("정기회의", "2026-07-15", List.of())
        );
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenReturn(fallbackResult);

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisSuccess(9L, fallbackResult, "SPRING_FALLBACK");
    }

    @Test
    void savesFailureWhenBothFastApiAndFallbackThrow() {
        when(fastApiMeetingClient.analyze(request)).thenThrow(new RuntimeException("연결 실패"));
        when(fallbackMeetingAnalyzer.analyze(request)).thenThrow(new RuntimeException("fallback 실패"));

        newRunner().runAnalysis(9L, request);

        verify(meetingAnalysisPersistence).saveAnalysisFailure(9L, "fallback 실패");
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisRunnerTest"`
Expected: FAIL — `MeetingAnalysisRunner` 클래스가 없어 컴파일 에러

- [ ] **Step 3: `MeetingAnalysisRunner` 구현**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java` 신규 작성:

```java
package com.workflowai.meeting;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class MeetingAnalysisRunner {
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

    @Async("meetingAnalysisExecutor")
    public void runAnalysis(Long meetingId, AiAnalyzeRequest request) {
        MeetingAnalysisResult result;
        String analysisSource;
        try {
            MeetingAnalysisResult fastApiResult;
            try {
                fastApiResult = fastApiMeetingClient.analyze(request);
            } catch (Exception e) {
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
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, e.getMessage());
            return;
        }

        try {
            meetingAnalysisPersistence.saveAnalysisSuccess(meetingId, result, analysisSource);
        } catch (Exception e) {
            meetingAnalysisPersistence.saveAnalysisFailure(meetingId, e.getMessage());
        }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisRunnerTest"`
Expected: `BUILD SUCCESSFUL`, 3 tests passed

- [ ] **Step 5: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisRunner.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisRunnerTest.java
git commit -m "feat: FastAPI/fallback 분석을 백그라운드로 실행하는 MeetingAnalysisRunner 추가"
```

---

### Task 4: `MeetingAnalysisService` 리팩터링 (즉시 응답 + retry) + DTO 확장

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisResponse.java`
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`

**Interfaces:**
- Consumes: `MeetingAnalysisRunner.runAnalysis(Long, AiAnalyzeRequest)`(Task 3).
- Produces: `MeetingAnalysisService.analyze(...)`가 즉시 `status="PROCESSING"`을 반환, `find(String): MeetingAnalysisResponse`(processing/failed도 200), `findStatus(String): MeetingStatusResponse`, `retry(String): MeetingAnalysisResponse`(실패 시 `IllegalStateException`) — Task 5(컨트롤러)가 호출한다. `MeetingAnalysisResponse`에 `errorMessage` 필드 추가.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java`:

```java
package com.workflowai.meeting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisServiceTest {

    @Mock private MeetingAnalysisRunner meetingAnalysisRunner;
    @Mock private DemoDataService demoDataService;
    @Mock private MeetingRepository meetingRepository;
    @Mock private MeetingAttendeeRepository meetingAttendeeRepository;
    @Mock private MeetingAnalysisRepository meetingAnalysisRepository;
    @Mock private MeetingActionItemRepository meetingActionItemRepository;
    @Mock private TaskRepository taskRepository;
    @Mock private NotificationRepository notificationRepository;
    @Mock private UserRepository userRepository;

    private MeetingAnalysisService newService() {
        return new MeetingAnalysisService(
            meetingAnalysisRunner, demoDataService, meetingRepository, meetingAttendeeRepository,
            meetingAnalysisRepository, meetingActionItemRepository, taskRepository, notificationRepository,
            userRepository, "/tmp/workflow-uploads"
        );
    }

    @Test
    void analyzeSavesMeetingAsProcessingAndReturnsImmediately() {
        MeetingAnalysisService service = newService();
        when(demoDataService.resolveProjectId("demo-project")).thenReturn(1L);
        when(meetingRepository.save(any(Meeting.class))).thenAnswer(invocation -> invocation.getArgument(0));

        MockMultipartFile file = new MockMultipartFile("file", "notes.txt", "text/plain", "회의 내용".getBytes());
        MeetingAnalysisResponse response = service.analyze(
            "demo-project", file, "7차 정기회의", "2026-07-15", "정기회의", "document", List.of("김민준")
        );

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(response.analysis()).isNull();
        ArgumentCaptor<Meeting> meetingCaptor = ArgumentCaptor.forClass(Meeting.class);
        verify(meetingRepository, atLeastOnce()).save(meetingCaptor.capture());
        assertThat(meetingCaptor.getAllValues().get(0).getAnalysisStatus()).isEqualTo("processing");
        verify(meetingAnalysisRunner).runAnalysis(any(), any(AiAnalyzeRequest.class));
    }

    @Test
    void retryRejectsMeetingThatIsNotFailed() {
        MeetingAnalysisService service = newService();
        Meeting meeting = new Meeting(1L, "정기회의", "document", "/tmp/x.txt", "processing", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        when(meetingRepository.findById(3L)).thenReturn(Optional.of(meeting));

        assertThatThrownBy(() -> service.retry("3")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void retryTransitionsFailedMeetingBackToProcessing() {
        MeetingAnalysisService service = newService();
        Meeting meeting = new Meeting(1L, "정기회의", "document", null, "failed", LocalDate.now(), "정기회의", "x.txt", null, 5L);
        meeting.setAnalysisErrorMessage("이전 실패 사유");
        when(meetingRepository.findById(4L)).thenReturn(Optional.of(meeting));
        when(meetingAttendeeRepository.findByMeetingId(4L)).thenReturn(List.of());

        MeetingAnalysisResponse response = service.retry("4");

        assertThat(response.status()).isEqualTo("PROCESSING");
        assertThat(meeting.getAnalysisStatus()).isEqualTo("processing");
        assertThat(meeting.getAnalysisErrorMessage()).isNull();
        verify(meetingAnalysisRunner).runAnalysis(4L, new AiAnalyzeRequest(
            "1", "정기회의", meeting.getMeetingDate().toString(), "정기회의", "document", "x.txt", "", List.of()
        ));
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest"`
Expected: FAIL — 현재 `MeetingAnalysisService` 생성자 시그니처가 다르고 `MeetingAnalysisResponse`에 `errorMessage`가 없어 컴파일 에러

- [ ] **Step 3: `MeetingStatusResponse` 신규 작성**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java`:

```java
package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 분석 상태 응답")
public record MeetingStatusResponse(
    @Schema(description = "회의록 ID", example = "1") String meetingId,
    @Schema(description = "분석 상태", example = "PROCESSING", allowableValues = {"PROCESSING", "COMPLETED", "FAILED"}) String status,
    @Schema(description = "실패 사유 (failed일 때만)", example = "FastAPI 서버 연결 실패") String errorMessage
) {}
```

- [ ] **Step 4: `MeetingAnalysisResponse`에 `errorMessage` 필드 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisResponse.java` 전체를 아래로 교체:

```java
package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 AI 분석 응답")
public record MeetingAnalysisResponse(
    @Schema(description = "회의록 ID", example = "demo-project-1") String meetingId,
    @Schema(description = "프로젝트 ID", example = "demo-project") String projectId,
    @Schema(description = "분석 상태", example = "PROCESSING", allowableValues = {"PROCESSING", "COMPLETED", "FAILED"}) String status,
    @Schema(description = "업로드 파일 유형", example = "document", allowableValues = {"document", "audio", "video"}) String sourceType,
    @Schema(description = "업로드된 원본 파일명", example = "7차_정기회의.pdf") String fileName,
    @Schema(description = "분석을 수행한 엔진", example = "FASTAPI", allowableValues = {"FASTAPI", "SPRING_FALLBACK"}) String analysisSource,
    @Schema(description = "AI 분석 결과 (processing/failed일 때는 null)") MeetingAnalysisResult analysis,
    @Schema(description = "실패 사유 (failed일 때만)", example = "FastAPI 서버 연결 실패") String errorMessage
) {}
```

- [ ] **Step 5: `MeetingAnalysisService` 전체 교체**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java` 전체를 아래로 교체:

```java
package com.workflowai.meeting;

import com.workflowai.common.DemoDataService;
import com.workflowai.notification.Notification;
import com.workflowai.notification.NotificationRepository;
import com.workflowai.task.Task;
import com.workflowai.task.TaskRepository;
import com.workflowai.user.User;
import com.workflowai.user.UserRepository;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class MeetingAnalysisService {
    private final MeetingAnalysisRunner meetingAnalysisRunner;
    private final DemoDataService demoDataService;
    private final MeetingRepository meetingRepository;
    private final MeetingAttendeeRepository meetingAttendeeRepository;
    private final MeetingAnalysisRepository meetingAnalysisRepository;
    private final MeetingActionItemRepository meetingActionItemRepository;
    private final TaskRepository taskRepository;
    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final String uploadsDir;

    public MeetingAnalysisService(
        MeetingAnalysisRunner meetingAnalysisRunner,
        DemoDataService demoDataService,
        MeetingRepository meetingRepository,
        MeetingAttendeeRepository meetingAttendeeRepository,
        MeetingAnalysisRepository meetingAnalysisRepository,
        MeetingActionItemRepository meetingActionItemRepository,
        TaskRepository taskRepository,
        NotificationRepository notificationRepository,
        UserRepository userRepository,
        @Value("${workflow.uploads.dir}") String uploadsDir
    ) {
        this.meetingAnalysisRunner = meetingAnalysisRunner;
        this.demoDataService = demoDataService;
        this.meetingRepository = meetingRepository;
        this.meetingAttendeeRepository = meetingAttendeeRepository;
        this.meetingAnalysisRepository = meetingAnalysisRepository;
        this.meetingActionItemRepository = meetingActionItemRepository;
        this.taskRepository = taskRepository;
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.uploadsDir = uploadsDir;
    }

    public MeetingAnalysisResponse analyze(
        String projectId,
        MultipartFile file,
        String title,
        String meetingDate,
        String meetingKind,
        String sourceType,
        List<String> participants
    ) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        String fileName = file == null ? null : file.getOriginalFilename();
        String text = extractText(file);
        String resolvedTitle = defaultString(title, "회의록 AI 분석 회의");
        String resolvedDate = defaultString(meetingDate, LocalDate.now().toString());
        String resolvedSourceType = defaultString(sourceType, "document");

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

        meeting.setFilePath(storeUploadedFile(meeting.getId(), file));
        meetingRepository.save(meeting);
        saveAttendees(meeting.getId(), safeParticipants(participants));

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            projectId,
            resolvedTitle,
            resolvedDate,
            defaultString(meetingKind, "정기회의"),
            resolvedSourceType,
            fileName,
            text,
            participants == null ? List.of() : participants
        );
        meetingAnalysisRunner.runAnalysis(meeting.getId(), request);

        String meetingId = String.valueOf(meeting.getId());
        return new MeetingAnalysisResponse(meetingId, projectId, "PROCESSING", resolvedSourceType, fileName, null, null, null);
    }

    public MeetingAnalysisResponse find(String meetingId) {
        Long id = parseLongOrNull(meetingId);
        if (id == null) return null;
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting == null) return null;

        if (!"completed".equals(meeting.getAnalysisStatus())) {
            String status = "failed".equals(meeting.getAnalysisStatus()) ? "FAILED" : "PROCESSING";
            return new MeetingAnalysisResponse(
                meetingId,
                String.valueOf(meeting.getProjectId()),
                status,
                meeting.getMeetingType(),
                meeting.getOriginalFileName(),
                null,
                null,
                meeting.getAnalysisErrorMessage()
            );
        }

        MeetingAnalysis analysis = meetingAnalysisRepository.findById(id).orElse(null);
        if (analysis == null) return null;

        List<MeetingTodo> todos = meetingActionItemRepository.findByMeetingId(id).stream()
            .map(this::toMeetingTodo)
            .toList();
        MeetingAnalysisResult result = new MeetingAnalysisResult(
            analysis.getSummary(),
            analysis.getDecisions(),
            todos,
            analysis.getRisks(),
            analysis.getKeywords(),
            new MeetingMeta(
                meeting.getTitle(),
                meeting.getMeetingDate() == null ? null : meeting.getMeetingDate().toString(),
                List.of()
            )
        );
        return new MeetingAnalysisResponse(
            meetingId,
            String.valueOf(meeting.getProjectId()),
            "COMPLETED",
            meeting.getMeetingType(),
            meeting.getOriginalFileName(),
            analysis.getAnalysisEngine(),
            result,
            null
        );
    }

    public MeetingStatusResponse findStatus(String meetingId) {
        Long id = parseLongOrNull(meetingId);
        if (id == null) return null;
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting == null) return null;
        String status = switch (meeting.getAnalysisStatus()) {
            case "completed" -> "COMPLETED";
            case "failed" -> "FAILED";
            default -> "PROCESSING";
        };
        return new MeetingStatusResponse(meetingId, status, meeting.getAnalysisErrorMessage());
    }

    public MeetingAnalysisResponse retry(String meetingId) {
        Long id = parseLongOrNull(meetingId);
        if (id == null) return null;
        Meeting meeting = meetingRepository.findById(id).orElse(null);
        if (meeting == null) return null;
        if (!"failed".equals(meeting.getAnalysisStatus())) {
            throw new IllegalStateException("MEETING_NOT_FAILED");
        }

        String text = extractTextFromStoredFile(meeting);
        List<String> participantNames = meetingAttendeeRepository.findByMeetingId(id).stream()
            .map(attendee -> userRepository.findById(attendee.getUserId()).map(User::getName).orElse(null))
            .filter(name -> name != null)
            .toList();

        AiAnalyzeRequest request = new AiAnalyzeRequest(
            String.valueOf(meeting.getProjectId()),
            meeting.getTitle(),
            meeting.getMeetingDate() == null ? LocalDate.now().toString() : meeting.getMeetingDate().toString(),
            defaultString(meeting.getMeetingType(), "정기회의"),
            defaultString(meeting.getFileType(), "document"),
            meeting.getOriginalFileName(),
            text,
            participantNames
        );

        meeting.setAnalysisStatus("processing");
        meeting.setAnalysisErrorMessage(null);
        meetingRepository.save(meeting);

        meetingAnalysisRunner.runAnalysis(meeting.getId(), request);

        return new MeetingAnalysisResponse(
            meetingId,
            String.valueOf(meeting.getProjectId()),
            "PROCESSING",
            meeting.getFileType(),
            meeting.getOriginalFileName(),
            null,
            null,
            null
        );
    }

    public List<MeetingSummary> findByProject(String projectId) {
        Long projectDbId = demoDataService.resolveProjectId(projectId);
        return meetingRepository.findByProjectIdOrderByCreatedAtDesc(projectDbId).stream()
            .map(m -> new MeetingSummary(
                String.valueOf(m.getId()),
                m.getTitle(),
                m.getMeetingDate() == null ? null : m.getMeetingDate().toString(),
                m.getMeetingType(),
                m.getAnalysisStatus()
            ))
            .toList();
    }

    @Transactional
    public TaskRegisterResponse registerTasks(String meetingId, TaskRegisterRequest request) {
        Long meetingDbId = parseLongOrNull(meetingId);
        List<MeetingTodo> todos = request == null || request.todos() == null ? List.of() : request.todos();
        Long currentLeaderId = demoDataService.resolveUserId("1");

        int registeredCount = 0;
        for (MeetingTodo todo : todos) {
            if (meetingDbId != null && registerSingleTask(meetingDbId, todo, currentLeaderId)) {
                registeredCount++;
            }
        }
        return new TaskRegisterResponse(meetingId, registeredCount, "REGISTERED");
    }

    private boolean registerSingleTask(Long meetingId, MeetingTodo todo, Long createdBy) {
        Long assigneeId = resolveAssignee(todo.assignee_id());
        LocalDate dueDate = parseDateOrNull(todo.due_date());

        Optional<MeetingActionItem> existingItem =
            meetingActionItemRepository.findFirstByMeetingIdAndTitle(meetingId, todo.title());
        if (existingItem.isPresent() && existingItem.get().getCreatedTaskId() != null) {
            return false;
        }

        Optional<Task> existingTask = taskRepository.findFirstBySourceMeetingIdAndTitleAndAssigneeIdAndDueDate(
            meetingId, todo.title(), assigneeId, dueDate
        );
        if (existingTask.isPresent()) {
            existingItem.ifPresent(item -> {
                item.setCreatedTaskId(existingTask.get().getId());
                meetingActionItemRepository.save(item);
            });
            return false;
        }

        Meeting meeting = meetingRepository.findById(meetingId).orElse(null);
        Task task = taskRepository.save(new Task(
            meeting == null ? null : meeting.getProjectId(),
            todo.title(),
            defaultString(todo.category(), "ETC"),
            "todo",
            assigneeId,
            dueDate,
            defaultString(todo.priority(), "MEDIUM"),
            todo.description(),
            "MEETING_AI",
            meetingId,
            createdBy
        ));

        MeetingActionItem item = existingItem.orElseGet(() -> new MeetingActionItem(
            meetingId, todo.title(), todo.description(), todo.category(),
            resolveAssigneeByName(todo.assignee_candidate()), assigneeId, dueDate, todo.priority(), null
        ));
        item.setFinalAssigneeId(assigneeId);
        item.setDueDate(dueDate);
        item.setApproved(true);
        item.setCreatedTaskId(task.getId());
        meetingActionItemRepository.save(item);

        if (assigneeId != null) {
            notificationRepository.save(new Notification(
                assigneeId,
                "TASK_ASSIGNED",
                "새 업무가 배정되었습니다",
                "'" + todo.title() + "' 업무가 배정되었습니다.",
                "task",
                task.getId()
            ));
        }
        return true;
    }

    private Long resolveAssigneeByName(String name) {
        if (name == null || name.isBlank()) return null;
        return userRepository.findFirstByName(name).map(User::getId).orElse(null);
    }

    private MeetingTodo toMeetingTodo(MeetingActionItem item) {
        return new MeetingTodo(
            item.getTitle(),
            item.getDescription(),
            resolveNameById(item.getRecommendedAssigneeId()),
            item.getFinalAssigneeId() == null ? null : String.valueOf(item.getFinalAssigneeId()),
            item.getDueDate() == null ? null : item.getDueDate().toString(),
            item.getPriority(),
            item.getCategory(),
            item.getFinalAssigneeId() == null
        );
    }

    private String resolveNameById(Long userId) {
        if (userId == null) return null;
        return userRepository.findById(userId).map(User::getName).orElse(null);
    }

    private String storeUploadedFile(Long meetingId, MultipartFile file) {
        if (file == null || file.isEmpty()) return null;
        try {
            Path dir = Path.of(uploadsDir, String.valueOf(meetingId)).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            String safeName = sanitizeFileName(file.getOriginalFilename());
            Path target = dir.resolve(safeName).normalize();
            if (!target.startsWith(dir)) {
                throw new IOException("Invalid upload file name: " + file.getOriginalFilename());
            }
            file.transferTo(target);
            return target.toString();
        } catch (IOException e) {
            return null;
        }
    }

    private String sanitizeFileName(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) return "upload.bin";
        String name = originalFilename.replace('\\', '/');
        int slashIndex = name.lastIndexOf('/');
        if (slashIndex >= 0) {
            name = name.substring(slashIndex + 1);
        }
        name = name.replaceAll("[\\p{Cntrl}:*?\"<>|]+", "_").trim();
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "upload.bin";
        }
        return name;
    }

    private void saveAttendees(Long meetingId, List<String> participantNames) {
        for (String name : participantNames) {
            userRepository.findFirstByName(name)
                .ifPresent(user -> meetingAttendeeRepository.save(new MeetingAttendee(meetingId, user.getId())));
        }
    }

    private Long resolveAssignee(String assigneeIdParam) {
        if (assigneeIdParam == null || assigneeIdParam.isBlank()) return null;
        Long resolved = demoDataService.resolveUserId(assigneeIdParam);
        if (resolved != null) return resolved;
        try {
            return Long.parseLong(assigneeIdParam);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate parseDateOrNull(String date) {
        if (date == null || date.isBlank()) return null;
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return null;
        }
    }

    private Long parseLongOrNull(String value) {
        try {
            return Long.parseLong(value);
        } catch (Exception e) {
            return null;
        }
    }

    private List<String> safeParticipants(List<String> participants) {
        if (participants == null) return List.of();
        return participants.stream().filter(p -> p != null && !p.isBlank()).toList();
    }

    private String extractText(MultipartFile file) {
        if (file == null || file.isEmpty()) return "";
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        String contentType = file.getContentType() == null ? "" : file.getContentType().toLowerCase();
        boolean textLike = contentType.startsWith("text/")
            || name.endsWith(".txt")
            || name.endsWith(".md")
            || name.endsWith(".csv")
            || name.endsWith(".json");
        if (name.endsWith(".docx")) {
            return extractDocxText(file);
        }
        if (!textLike) {
            return "업로드 파일명: " + file.getOriginalFilename() + ". 바이너리 문서는 FastAPI 문서 파서 또는 STT 단계에서 텍스트 추출 예정.";
        }
        try {
            return new String(file.getBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private String extractTextFromStoredFile(Meeting meeting) {
        String filePath = meeting.getFilePath();
        if (filePath == null || filePath.isBlank()) return "";
        String fileName = meeting.getOriginalFileName() == null ? "" : meeting.getOriginalFileName().toLowerCase();
        boolean textLike = fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".csv") || fileName.endsWith(".json");
        try {
            byte[] bytes = Files.readAllBytes(Path.of(filePath));
            if (fileName.endsWith(".docx")) {
                return extractDocxTextFromBytes(bytes);
            }
            if (!textLike) {
                return "업로드 파일명: " + meeting.getOriginalFileName() + ". 바이너리 문서는 FastAPI 문서 파서 또는 STT 단계에서 텍스트 추출 예정.";
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException e) {
            return "";
        }
    }

    private String extractDocxText(MultipartFile file) {
        try {
            return extractDocxTextFromBytes(file.getBytes());
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

    private String defaultString(String value, String defaultValue) {
        return value == null || value.isBlank() ? defaultValue : value;
    }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisServiceTest"`
Expected: `BUILD SUCCESSFUL`, 3 tests passed

- [ ] **Step 7: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingStatusResponse.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisResponse.java \
        App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisService.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisServiceTest.java
git commit -m "refactor: MeetingAnalysisService가 즉시 응답 후 백그라운드 분석을 트리거하도록 변경, retry 추가"
```

---

### Task 5: 컨트롤러 — `/status`, `/retry` 엔드포인트 추가

**Files:**
- Modify: `App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java`

**Interfaces:**
- Consumes: `MeetingAnalysisService.findStatus(String)`, `MeetingAnalysisService.retry(String)`(Task 4).
- Produces: `GET /api/v1/projects/{projectId}/meetings/{meetingId}/status`, `POST /api/v1/projects/{projectId}/meetings/{meetingId}/retry` — 프론트(Task 7)가 `retryMeetingAnalysis`로 호출한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java`:

```java
package com.workflowai.meeting;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisControllerTest {

    @Mock
    private MeetingAnalysisService meetingAnalysisService;

    @Test
    void statusReturns404WhenMeetingMissing() throws Exception {
        when(meetingAnalysisService.findStatus("999")).thenReturn(null);
        MeetingAnalysisController controller = new MeetingAnalysisController(meetingAnalysisService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/demo-project/meetings/999/status"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("MEETING_NOT_FOUND"));
    }

    @Test
    void retryReturns409WhenMeetingIsNotFailed() throws Exception {
        when(meetingAnalysisService.retry("42")).thenThrow(new IllegalStateException("MEETING_NOT_FAILED"));
        MeetingAnalysisController controller = new MeetingAnalysisController(meetingAnalysisService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/v1/projects/demo-project/meetings/42/retry"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("MEETING_NOT_FAILED"));
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisControllerTest"`
Expected: FAIL — `/status`, `/retry` 엔드포인트가 없어 404

- [ ] **Step 3: 컨트롤러에 엔드포인트 추가**

`App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java` 전체를 아래로 교체:

```java
package com.workflowai.meeting;

import com.workflowai.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Tag(
    name = "회의록 AI",
    description = "회의록 업로드, AI 분석, 분석 결과 조회, To-Do 후보 승인 및 업무 등록 API"
)
@RestController
@RequestMapping("/api/v1/projects/{projectId}/meetings")
public class MeetingAnalysisController {
    private final MeetingAnalysisService meetingAnalysisService;

    public MeetingAnalysisController(MeetingAnalysisService meetingAnalysisService) {
        this.meetingAnalysisService = meetingAnalysisService;
    }

    @Operation(
        summary = "회의록 AI 분석 요청",
        description = "업로드된 회의록 파일 또는 텍스트를 저장하고 즉시 meetingId를 반환합니다. "
            + "실제 AI 분석(FastAPI 호출 또는 Spring fallback)은 백그라운드에서 실행되며, "
            + "상태는 GET /{meetingId} 또는 GET /{meetingId}/status로 조회합니다."
    )
    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<MeetingAnalysisResponse> analyze(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 원본 파일 (문서/음성/영상)") @RequestPart(value = "file", required = false) MultipartFile file,
        @Parameter(description = "회의 제목", example = "7차 정기회의") @RequestParam(value = "title", required = false) String title,
        @Parameter(description = "회의 날짜 (YYYY-MM-DD)", example = "2026-07-09") @RequestParam(value = "meetingDate", required = false) String meetingDate,
        @Parameter(description = "회의 유형", example = "정기회의") @RequestParam(value = "meetingKind", required = false) String meetingKind,
        @Parameter(description = "업로드 파일 유형", example = "document", schema = @Schema(allowableValues = {"document", "audio", "video"})) @RequestParam(value = "sourceType", required = false) String sourceType,
        @Parameter(description = "참석자 이름 목록", example = "[\"김민준\", \"이서연\"]") @RequestParam(value = "participants", required = false) List<String> participants
    ) {
        return ApiResponse.ok(meetingAnalysisService.analyze(
            projectId,
            file,
            title,
            meetingDate,
            meetingKind,
            sourceType,
            participants
        ));
    }

    @Operation(
        summary = "회의록 목록 조회",
        description = "프로젝트에 등록된 회의록 목록을 최신순으로 조회합니다."
    )
    @GetMapping
    public ApiResponse<List<MeetingSummary>> getMeetings(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        return ApiResponse.ok(meetingAnalysisService.findByProject(projectId));
    }

    @Operation(
        summary = "회의록 분석 결과/상태 조회",
        description = "회의록의 분석 상태(processing/completed/failed)와, 완료된 경우 분석 결과 및 To-Do 후보 목록을 조회합니다."
    )
    @GetMapping("/{meetingId}")
    public ResponseEntity<ApiResponse<MeetingAnalysisResponse>> getMeeting(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId
    ) {
        MeetingAnalysisResponse response = meetingAnalysisService.find(meetingId);
        if (response == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("MEETING_NOT_FOUND", "회의록 분석 결과를 찾을 수 없습니다."));
        }
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @Operation(
        summary = "회의록 분석 상태 조회",
        description = "분석 결과 없이 상태(processing/completed/failed)와 실패 사유만 가볍게 조회합니다."
    )
    @GetMapping("/{meetingId}/status")
    public ResponseEntity<ApiResponse<MeetingStatusResponse>> getMeetingStatus(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId
    ) {
        MeetingStatusResponse response = meetingAnalysisService.findStatus(meetingId);
        if (response == null) {
            return ResponseEntity.status(404).body(ApiResponse.fail("MEETING_NOT_FOUND", "회의록을 찾을 수 없습니다."));
        }
        return ResponseEntity.ok(ApiResponse.ok(response));
    }

    @Operation(
        summary = "회의록 재분석 요청",
        description = "분석에 실패한(failed) 회의록을 processing 상태로 전환하고 백그라운드 분석을 재실행합니다."
    )
    @PostMapping("/{meetingId}/retry")
    public ResponseEntity<ApiResponse<MeetingAnalysisResponse>> retryAnalysis(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId
    ) {
        try {
            MeetingAnalysisResponse response = meetingAnalysisService.retry(meetingId);
            if (response == null) {
                return ResponseEntity.status(404).body(ApiResponse.fail("MEETING_NOT_FOUND", "회의록을 찾을 수 없습니다."));
            }
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(409).body(ApiResponse.fail("MEETING_NOT_FAILED", "분석 실패 상태의 회의록만 재시도할 수 있습니다."));
        }
    }

    @Operation(
        summary = "회의록 To-Do 업무 등록",
        description = "팀장이 승인한 회의록 기반 To-Do 후보를 실제 업무(Task)로 등록합니다. 등록된 업무는 업무보드와 대시보드에서 사용할 수 있습니다."
    )
    @PostMapping("/{meetingId}/tasks/register")
    public ApiResponse<TaskRegisterResponse> registerTasks(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId,
        @Parameter(description = "회의록 ID", example = "demo-project-1") @PathVariable String meetingId,
        @RequestBody TaskRegisterRequest request
    ) {
        return ApiResponse.ok(meetingAnalysisService.registerTasks(meetingId, request));
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.meeting.MeetingAnalysisControllerTest"`
Expected: `BUILD SUCCESSFUL`, 2 tests passed

- [ ] **Step 5: 전체 백엔드 테스트 실행**

Run: `cd App/backend_spring && ./gradlew test`
Expected: `BUILD SUCCESSFUL`, 기존 테스트(`DatabaseUrlPropertyMapperTest`, `RagRateLimiterTest`, `RagControllerTest`) + 신규 테스트 모두 통과

- [ ] **Step 6: Commit**

```bash
git add App/backend_spring/src/main/java/com/workflowai/meeting/MeetingAnalysisController.java \
        App/backend_spring/src/test/java/com/workflowai/meeting/MeetingAnalysisControllerTest.java
git commit -m "feat: 회의록 분석 상태 조회(/status)와 재분석(/retry) API 추가"
```

---

### Task 6: 프론트 `meetingAiApi.ts` — `fetchMeeting`/`retryMeetingAnalysis` 추가

**Files:**
- Modify: `App/frontend/src/meetings/libs/utils/meetingAiApi.ts`

**Interfaces:**
- Produces: `analyzeMeeting(params): Promise<MeetingAnalysisResponse>`(응답 타입 변경), `fetchMeeting(projectId, meetingId): Promise<MeetingAnalysisResponse>`, `retryMeetingAnalysis(projectId, meetingId): Promise<MeetingAnalysisResponse>` — Task 7(`MeetingsView.tsx`)이 사용한다. `MeetingAnalysisResponse = { meetingId, projectId, status: "PROCESSING"|"COMPLETED"|"FAILED", sourceType, fileName, analysisSource, analysis: MeetingAiResult|null, errorMessage: string|null }`.

- [ ] **Step 1: 전체 파일 교체**

`App/frontend/src/meetings/libs/utils/meetingAiApi.ts` 전체를 아래로 교체:

```typescript
import type { MeetingAiResult, MeetingAiTodo } from "../types/meetingAiTypes";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface AnalyzeMeetingParams {
  projectId: string;
  file: File | null;
  title: string;
  meetingDate: string;
  meetingKind: string;
  sourceType: "document" | "audio" | "video";
  participants: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

export type MeetingAnalysisStatus = "PROCESSING" | "COMPLETED" | "FAILED";

export interface MeetingAnalysisResponse {
  meetingId: string;
  projectId: string;
  status: MeetingAnalysisStatus;
  sourceType: string;
  fileName: string | null;
  analysisSource: "FASTAPI" | "SPRING_FALLBACK" | null;
  analysis: MeetingAiResult | null;
  errorMessage: string | null;
}

async function unwrapEnvelope<T>(response: Response, failureMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${failureMessage}: ${response.status}`);
  }
  const body = await response.json() as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error?.message ?? failureMessage);
  }
  return body.data;
}

export async function analyzeMeeting(params: AnalyzeMeetingParams): Promise<MeetingAnalysisResponse> {
  const formData = new FormData();
  if (params.file) formData.append("file", params.file);
  formData.append("title", params.title);
  formData.append("meetingDate", params.meetingDate);
  formData.append("meetingKind", params.meetingKind);
  formData.append("sourceType", params.sourceType);
  params.participants.forEach(participant => formData.append("participants", participant));

  const response = await fetch(`${API_BASE_URL}/projects/${params.projectId}/meetings/analyze`, {
    method: "POST",
    body: formData,
  });
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting analysis failed");
}

export async function fetchMeeting(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}`);
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting fetch failed");
}

export async function retryMeetingAnalysis(projectId: string, meetingId: string): Promise<MeetingAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}/retry`, {
    method: "POST",
  });
  return unwrapEnvelope<MeetingAnalysisResponse>(response, "Meeting retry failed");
}

export interface MeetingSummaryDto {
  meetingId: string;
  title: string;
  meetingDate: string | null;
  meetingType: string | null;
  analysisStatus: string;
}

export async function fetchMeetings(projectId: string): Promise<MeetingSummaryDto[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings`);
  return unwrapEnvelope<MeetingSummaryDto[]>(response, "Meeting list fetch failed");
}

export interface TaskRegisterResponseDto {
  meetingId: string;
  registeredCount: number;
  boardStatus: string;
}

export async function registerMeetingTasks(
  projectId: string,
  meetingId: string,
  todos: MeetingAiTodo[]
): Promise<TaskRegisterResponseDto> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/meetings/${meetingId}/tasks/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ todos }),
  });
  return unwrapEnvelope<TaskRegisterResponseDto>(response, "Task register failed");
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd App/frontend && pnpm exec tsc --noEmit`
Expected: `meetingAiApi.ts` 관련 타입 오류 없음 (다음 Task에서 `MeetingsView.tsx`를 아직 고치지 않았다면 그쪽에서 `analysis`가 nullable이 된 것에 대한 오류가 날 수 있음 — Task 7에서 해결)

- [ ] **Step 3: Commit**

```bash
git add App/frontend/src/meetings/libs/utils/meetingAiApi.ts
git commit -m "feat: fetchMeeting/retryMeetingAnalysis 추가, 응답 타입에 status/errorMessage 반영"
```

---

### Task 7: 프론트 `MeetingsView.tsx` — 실제 polling + 재시도 버튼

**Files:**
- Modify: `App/frontend/src/meetings/screen/MeetingsView.tsx`

**Interfaces:**
- Consumes: `fetchMeeting`, `retryMeetingAnalysis`, `MeetingAnalysisResponse`(Task 6).

- [ ] **Step 1: import 수정**

`App/frontend/src/meetings/screen/MeetingsView.tsx` 12번째 줄, 기존:

```typescript
import { analyzeMeeting, fetchMeetings, registerMeetingTasks } from "../libs/utils/meetingAiApi";
```

교체:

```typescript
import { analyzeMeeting, fetchMeeting, fetchMeetings, registerMeetingTasks, retryMeetingAnalysis } from "../libs/utils/meetingAiApi";
```

- [ ] **Step 2: `activeMeetingId` state 추가**

기존 (약 293번째 줄):

```typescript
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
```

교체:

```typescript
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
```

- [ ] **Step 3: `pollIntervalRef` 추가**

기존 (약 313~314번째 줄):

```typescript
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);
```

교체:

```typescript
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 4: 가짜 progress effect 수정 + polling 함수 추가**

기존 (약 318~329번째 줄):

```typescript
  // Simulate analysis progress
  useEffect(() => {
    if (uploadFlow !== "analyzing") return;
    let prog = 0; let stg = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + 1.5, 100);
      stg = Math.min(Math.floor(prog / (100 / analyzeStages.length)), analyzeStages.length - 1);
      setAnalyzeStage(stg); setAnalyzeProgress(Math.round(prog));
      if (prog >= 100) { clearInterval(iv); setTimeout(() => { setUploadFlow("results"); setPanelTab("summary"); }, 600); }
    }, 70);
    return () => clearInterval(iv);
  }, [uploadFlow, analyzeStages.length]);
```

교체:

```typescript
  // 가짜 진행률 애니메이션: 실제 서버 상태를 모르므로 90%에서 멈추고 대기한다.
  // 실제 완료/실패 전환은 아래 polling(stopPolling/pollMeetingStatus)이 담당한다.
  useEffect(() => {
    if (uploadFlow !== "analyzing") return;
    let prog = 0; let stg = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + 1.5, 90);
      stg = Math.min(Math.floor(prog / (100 / analyzeStages.length)), analyzeStages.length - 1);
      setAnalyzeStage(stg); setAnalyzeProgress(Math.round(prog));
    }, 70);
    return () => clearInterval(iv);
  }, [uploadFlow, analyzeStages.length]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // "analyzing" 화면을 벗어나면(완료/실패/사용자 이탈) polling을 중단한다.
  useEffect(() => {
    if (uploadFlow !== "analyzing") stopPolling();
  }, [uploadFlow]);

  // unmount 시 polling 정리
  useEffect(() => () => stopPolling(), []);

  // meetingId를 대상으로 서버 분석 상태를 2초 간격으로 조회해 completed/failed를 반영한다.
  const pollMeetingStatus = (meetingId: string, title: string, uploadedAt: string) => {
    stopPolling();
    pollIntervalRef.current = setInterval(() => {
      fetchMeeting("demo-project", meetingId).then(response => {
        if (response.status === "PROCESSING") return;
        stopPolling();
        if (response.status === "COMPLETED" && response.analysis) {
          const apiTodos = buildGeneratedTodos(response.analysis);
          const source = response.analysisSource === "FASTAPI" ? "fastapi" : "spring-fallback";
          const analyzedMeeting: Meeting = {
            id: response.meetingId,
            title: response.analysis.meeting_meta.title || title,
            date: formatDisplayDate(response.analysis.meeting_meta.meeting_date || meetDate),
            duration: "분석 완료",
            status: "processed",
            summary: response.analysis.summary,
            decisions: response.analysis.decisions,
            todos: response.analysis.todos.map(todo => {
              const assignee = todo.assignee_candidate || "미배정";
              const due = todo.due_date ? ` (${todo.due_date.slice(5).replace("-", ".")})` : "";
              return `${assignee}: ${todo.title}${due}`;
            }),
            risks: response.analysis.risks,
            analysisSource: source,
            fileName: selectedFile?.name,
            uploadedAt,
            analyzedAt: new Date().toISOString(),
          };
          setAnalysisResult(response.analysis);
          setSelTodos(apiTodos.map(t => t.id));
          setAnalysisSource(source);
          setMeetings(prev => {
            const next = [analyzedMeeting, ...prev.filter(item => item.id !== analyzedMeeting.id)];
            saveStoredMeetings(next);
            return next;
          });
          setSelected(analyzedMeeting.id);
          setUploadFlow("results");
          setPanelTab("summary");
        } else {
          setAnalysisResult(null);
          setSelTodos([]);
          setAnalysisSource(null);
          setAnalysisError(response.errorMessage ?? "분석 중 오류가 발생했습니다. 다시 시도해주세요.");
          setUploadFlow("results");
        }
      }).catch(() => {
        // 네트워크 오류는 일시적일 수 있으므로 polling을 유지한다.
      });
    }, 2000);
  };
```

- [ ] **Step 5: `startAnalysis`의 `.then`/`.catch`를 polling 트리거로 교체, `handleRetryAnalysis` 추가**

기존 (약 568~605번째 줄, `startAnalysis` 함수 안 `void analyzeMeeting({...})` 부분부터 함수 끝까지):

```typescript
    void analyzeMeeting({
      projectId: "demo-project",
      file: selectedFile,
      title,
      meetingDate: meetDate,
      meetingKind: meetKind,
      sourceType: uploadType,
      participants: partIds.map(id => MEMBERS.find(member => member.id === id)?.name ?? id),
    }).then(response => {
      const apiTodos = buildGeneratedTodos(response.analysis);
      const source = response.analysisSource === "FASTAPI" ? "fastapi" : "spring-fallback";
      const analyzedMeeting: Meeting = {
        id: response.meetingId,
        title: response.analysis.meeting_meta.title || title,
        date: formatDisplayDate(response.analysis.meeting_meta.meeting_date || meetDate),
        duration: "분석 완료",
        status: "processed",
        summary: response.analysis.summary,
        decisions: response.analysis.decisions,
        todos: response.analysis.todos.map(todo => {
          const assignee = todo.assignee_candidate || "미배정";
          const due = todo.due_date ? ` (${todo.due_date.slice(5).replace("-", ".")})` : "";
          return `${assignee}: ${todo.title}${due}`;
        }),
        risks: response.analysis.risks,
        analysisSource: source,
        fileName: selectedFile?.name,
        uploadedAt,
        analyzedAt: new Date().toISOString(),
      };
      setAnalysisResult(response.analysis);
      setSelTodos(apiTodos.map(t => t.id));
      setAnalysisSource(source);
      setMeetings(prev => {
        const next = [analyzedMeeting, ...prev.filter(item => item.id !== analyzedMeeting.id)];
        saveStoredMeetings(next);
        return next;
      });
      setSelected(analyzedMeeting.id);
    }).catch(() => {
      setAnalysisResult(null);
      setSelTodos([]);
      setAnalysisSource(null);
      setAnalysisError("분석 서버 연결에 실패했습니다. Spring Boot와 FastAPI 서버가 실행 중인지 확인한 뒤 다시 시도해주세요.");
    });
  };
```

교체:

```typescript
    void analyzeMeeting({
      projectId: "demo-project",
      file: selectedFile,
      title,
      meetingDate: meetDate,
      meetingKind: meetKind,
      sourceType: uploadType,
      participants: partIds.map(id => MEMBERS.find(member => member.id === id)?.name ?? id),
    }).then(response => {
      setActiveMeetingId(response.meetingId);
      pollMeetingStatus(response.meetingId, title, uploadedAt);
    }).catch(() => {
      setAnalysisResult(null);
      setSelTodos([]);
      setAnalysisSource(null);
      setAnalysisError("분석 서버 연결에 실패했습니다. Spring Boot와 FastAPI 서버가 실행 중인지 확인한 뒤 다시 시도해주세요.");
      setUploadFlow("results");
    });
  };

  const handleRetryAnalysis = () => {
    if (!activeMeetingId) return;
    const uploadedAt = new Date().toISOString();
    setAnalysisResult(null);
    setSelTodos([]);
    setAnalysisSource(null);
    setAnalysisError(null);
    setAnalyzeStage(0);
    setAnalyzeProgress(0);
    setUploadFlow("analyzing");

    void retryMeetingAnalysis("demo-project", activeMeetingId).then(response => {
      setActiveMeetingId(response.meetingId);
      pollMeetingStatus(response.meetingId, meetTitle, uploadedAt);
    }).catch(() => {
      setAnalysisError("재분석 요청에 실패했습니다. 다시 시도해주세요.");
      setUploadFlow("results");
    });
  };
```

- [ ] **Step 6: 실패 화면에 "다시 분석" 버튼 추가**

기존 (약 776~783번째 줄):

```tsx
            <div className="flex gap-3 justify-center">
              <button onClick={() => setUploadFlow("modal")} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                다시 업로드
              </button>
              <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                회의록으로 돌아가기
              </button>
            </div>
```

교체:

```tsx
            <div className="flex gap-3 justify-center">
              {analysisError && (
                <button onClick={handleRetryAnalysis} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                  다시 분석
                </button>
              )}
              <button onClick={() => setUploadFlow("modal")} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                다시 업로드
              </button>
              <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                회의록으로 돌아가기
              </button>
            </div>
```

- [ ] **Step 7: 타입/빌드 확인**

Run: `cd App/frontend && pnpm build`
Expected: 빌드 성공, 타입 오류 없음

- [ ] **Step 8: Commit**

```bash
git add App/frontend/src/meetings/screen/MeetingsView.tsx
git commit -m "feat: MeetingsView가 실제 서버 상태를 polling하고 실패 시 재분석할 수 있도록 변경"
```

---

### Task 8: 최종 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd App/backend_spring && ./gradlew test`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: 프론트 빌드**

Run: `cd App/frontend && pnpm build`
Expected: 빌드 성공

- [ ] **Step 3: 변경 사항 최종 확인**

Run: `git log --oneline -10 && git status --short`
Expected: Task 1~7의 커밋이 순서대로 존재, working tree clean
