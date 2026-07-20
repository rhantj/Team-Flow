# FS-09 기여도 점수 Spring 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FastAPI `/ai/score/contribution`(기여도 숫자 점수)을 Spring에서 호출할 수 있는
`POST /api/v1/ai/contribution/score` 엔드포인트를 추가한다. 심사자(REVIEWER) 전용이며,
같은 패키지의 기존 `ContributionReportController`(LLM 서술형 요약)와 동일한 패턴을 따른다.

**Architecture:** `com.workflowai.contribution` 패키지에 `ContributionScoreController` +
`FastApiContributionScoreClient` + DTO 3종을 추가한다. Rate limit은 기존 `RagRateLimiter`
빈을 그대로 재사용(새로 안 만듦). FastAPI 응답이 `{success, data, error}` envelope이라
`ContributionScoreEnvelope`로 한 번 감싸 받은 뒤 `.data()`만 꺼내 반환한다(형제 클라이언트와의
유일한 구조적 차이).

**Tech Stack:** Java 21, Spring Boot 3.5, Spring Security(`@PreAuthorize`), `RestClient` +
JDK `HttpClient`, JUnit 5 + Mockito + MockMvc(standalone/`@WebMvcTest`).

## Global Constraints

- 새 파일은 전부 기존 `com.workflowai.contribution` 패키지에 추가한다 — 새 패키지 만들지 않는다.
- FastAPI 호출은 **쿼리 파라미터**(`?project_id={id}`)로 한다 — JSON body를 보내지 않는다
  (`/ai/report/contribution`과 다름, `contribution_router.py`의
  `async def score_contribution(project_id: int)` 시그니처 때문).
- 팀원 식별자 필드명은 `assignee_id`(String)다 — `MemberContributionDto`의 `user_id`(Long)와
  다르다. 절대 `user_id`로 쓰지 않는다.
- FastAPI 응답은 envelope(`{success, data, error}`)이 씌워져 있다 — `ContributionScoreEnvelope`로
  한 번 감싸 받고 `.data()`를 꺼낸다. `FastApiContributionClient`/`FastApiRagClient`처럼
  데이터 모델을 직접 역직렬화하면 안 된다(그 둘은 FastAPI 쪽이 envelope 없이 반환하기 때문에
  가능한 것 — 우리 쪽은 다름).
- 엔드포인트 경로: `POST /api/v1/ai/contribution/score` (기존 `/api/v1/ai/contribution/report`와
  `@RequestMapping("/api/v1/ai/contribution")`를 공유하고 `@PostMapping`만 다름 — 충돌 없음).
- 권한: `@PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")` — 기존
  `ContributionReportController`와 동일한 형태로 정확히 맞춘다.
- 에러 코드: FastAPI 호출 실패 시 503 + `ApiResponse.fail("CONTRIBUTION_SCORE_UNAVAILABLE", "기여도 점수를 조회하지 못했습니다.")`.
- Rate limiter는 새로 안 만들고 `com.workflowai.rag.RagRateLimiter` 빈을 그대로 주입받는다
  (`ContributionReportController`가 이미 이렇게 재사용 중인 패턴).
- 관련 스펙: `document_이은주/superpowers/specs/2026-07-20-contribution-score-spring-integration-design.md`

---

### Task 1: DTO 3종 + `FastApiContributionScoreClient` + `ContributionScoreController` + 컨트롤러 단위 테스트

**Files:**
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreRequest.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionMemberScoreDto.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreResponseDto.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreEnvelope.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/FastApiContributionScoreClient.java`
- Create: `App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreController.java`
- Test: `App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java`

**Interfaces:**
- Produces: `record ContributionScoreRequest(Long project_id) {}`
- Produces: `record ContributionMemberScoreDto(String assignee_id, Double workload_component, Double task_component, Double meeting_component, Double contribution_score) {}`
- Produces: `record ContributionScoreResponseDto(String schema_version, Long project_id, List<ContributionMemberScoreDto> members, String note) {}`
- Produces: `record ContributionScoreEnvelope(boolean success, ContributionScoreResponseDto data) {}`
- Produces: `class FastApiContributionScoreClient { public ContributionScoreResponseDto fetch(Long projectId) }` — Task 1의 컨트롤러가 이 시그니처로 호출(같은 태스크 안에서 완결)
- Produces: `POST /api/v1/ai/contribution/score` 엔드포인트 — Task 2의 보안 테스트가 이 경로로 호출
- Consumes: `com.workflowai.common.ApiResponse`(기존), `com.workflowai.rag.RagRateLimiter`(기존, 수정 없음)

- [ ] **Step 1: 실패하는 컨트롤러 테스트부터 작성**

`App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java`:

```java
package com.workflowai.contribution;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.rag.RagRateLimiter;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class ContributionScoreControllerTest {

    @Mock
    private FastApiContributionScoreClient fastApiContributionScoreClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void getScoreReturnsDataFromFastApi() throws Exception {
        ContributionScoreResponseDto fastApiResponse = new ContributionScoreResponseDto(
            "1.0",
            1L,
            List.of(new ContributionMemberScoreDto("3", 100.0, 80.0, 80.0, 86.7)),
            null
        );
        when(fastApiContributionScoreClient.fetch(1L)).thenReturn(fastApiResponse);

        ContributionScoreController controller = new ContributionScoreController(
            fastApiContributionScoreClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionScoreRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/score").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.members[0].assignee_id").value("3"))
            .andExpect(jsonPath("$.data.members[0].contribution_score").value(86.7));
    }

    @Test
    void getScoreReturns503WhenFastApiFails() throws Exception {
        when(fastApiContributionScoreClient.fetch(any())).thenThrow(new RuntimeException("connection refused"));

        ContributionScoreController controller = new ContributionScoreController(
            fastApiContributionScoreClient,
            new RagRateLimiter(10, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionScoreRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/score").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.error.code").value("CONTRIBUTION_SCORE_UNAVAILABLE"));
    }

    @Test
    void getScoreReturns429WhenRateLimited() throws Exception {
        ContributionScoreController controller = new ContributionScoreController(
            fastApiContributionScoreClient,
            new RagRateLimiter(0, 60)
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        String body = objectMapper.writeValueAsString(new ContributionScoreRequest(1L));

        mockMvc.perform(post("/api/v1/ai/contribution/score").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인 (컴파일 에러 — 클래스들이 없음)**

Run (리포지토리 루트에서): `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionScoreControllerTest"`
Expected: FAIL — 컴파일 에러 (`ContributionScoreController`, `ContributionScoreRequest` 등 심볼을 찾을 수 없음)

- [ ] **Step 3: DTO 4종 구현**

`ContributionScoreRequest.java`:
```java
package com.workflowai.contribution;

public record ContributionScoreRequest(Long project_id) {}
```

`ContributionMemberScoreDto.java`:
```java
package com.workflowai.contribution;

public record ContributionMemberScoreDto(
    String assignee_id,
    Double workload_component,
    Double task_component,
    Double meeting_component,
    Double contribution_score
) {}
```

`ContributionScoreResponseDto.java`:
```java
package com.workflowai.contribution;

import java.util.List;

public record ContributionScoreResponseDto(
    String schema_version,
    Long project_id,
    List<ContributionMemberScoreDto> members,
    String note
) {}
```

`ContributionScoreEnvelope.java`:
```java
package com.workflowai.contribution;

public record ContributionScoreEnvelope(boolean success, ContributionScoreResponseDto data) {}
```

- [ ] **Step 4: `FastApiContributionScoreClient` 구현**

```java
package com.workflowai.contribution;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class FastApiContributionScoreClient {
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestClient restClient;

    public FastApiContributionScoreClient(@Value("${workflow.ai.base-url}") String baseUrl) {
        HttpClient httpClient = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(CONNECT_TIMEOUT)
            .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .build();
    }

    public ContributionScoreResponseDto fetch(Long projectId) {
        ContributionScoreEnvelope envelope = restClient.post()
            .uri("/ai/score/contribution?project_id={id}", projectId)
            .retrieve()
            .body(ContributionScoreEnvelope.class);
        return envelope.data();
    }
}
```

- [ ] **Step 5: `ContributionScoreController` 구현**

```java
package com.workflowai.contribution;

import com.workflowai.common.ApiResponse;
import com.workflowai.rag.RagRateLimiter;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI 기여도 점수", description = "심사자 전용 팀원별 기여도 숫자 점수 API")
@RestController
@RequestMapping("/api/v1/ai/contribution")
public class ContributionScoreController {
    private final FastApiContributionScoreClient fastApiContributionScoreClient;
    private final RagRateLimiter rateLimiter;

    public ContributionScoreController(
        FastApiContributionScoreClient fastApiContributionScoreClient,
        RagRateLimiter rateLimiter
    ) {
        this.fastApiContributionScoreClient = fastApiContributionScoreClient;
        this.rateLimiter = rateLimiter;
    }

    @Operation(
        summary = "기여도 점수 조회",
        description = "workload/task/meeting 3피처 가중 평균으로 산정된 팀원별 기여도 점수를 조회합니다. 심사자만 호출 가능합니다."
    )
    @PostMapping("/score")
    @PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")
    public ResponseEntity<ApiResponse<ContributionScoreResponseDto>> getScore(
        @RequestBody ContributionScoreRequest request
    ) {
        if (!rateLimiter.tryAcquire(request.project_id())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요."));
        }

        try {
            ContributionScoreResponseDto response = fastApiContributionScoreClient.fetch(request.project_id());
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("CONTRIBUTION_SCORE_UNAVAILABLE", "기여도 점수를 조회하지 못했습니다."));
        }
    }
}
```

- [ ] **Step 6: 테스트 재실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionScoreControllerTest"`
Expected: `3 tests completed, 0 failed`

- [ ] **Step 7: 커밋**

```bash
git add App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreRequest.java \
        App/backend_spring/src/main/java/com/workflowai/contribution/ContributionMemberScoreDto.java \
        App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreResponseDto.java \
        App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreEnvelope.java \
        App/backend_spring/src/main/java/com/workflowai/contribution/FastApiContributionScoreClient.java \
        App/backend_spring/src/main/java/com/workflowai/contribution/ContributionScoreController.java \
        App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreControllerTest.java
git commit -m "feat: 기여도 점수(/ai/score/contribution) Spring 연동 - ContributionScoreController"
```

---

### Task 2: 권한(REVIEWER) 보안 테스트 — **스코프에서 제외됨 (2026-07-20)**

> 실행하지 않음. `@WebMvcTest(ContributionReportController.class)`를 그대로 실행해보니
> (Task 2 착수 전 사전 확인) 저희 작업과 무관한 기존 문제로 이미 실패하고 있었다 —
> `WorkFlowAiBackendApplication`의 명시적 `@EnableJpaRepositories`/`@ComponentScan`이
> `@WebMvcTest`의 컨텍스트 격리를 무력화해서, 앱 전체 컨트롤러 그래프(`ActivityController`
> → `AuthController`/`GoogleOAuthService` 등)가 연쇄적으로 끌려들어와 실패한다. 개별
> 컨트롤러를 `@MockBean`으로 회피하는 것도 시도했으나 다른 무관한 컨트롤러가 계속
> 새로 걸려서 실용적이지 않다고 판단, 이번 스코프에서는 이 테스트를 만들지 않기로 함.
> 근본 원인/재현 방법/제안 수정 방향은 `document_이은주/2026-07-20-webmvctest-infra-issue.md`에
> 정리해서 팀에 공유함. `@PreAuthorize` 어노테이션 자체는 이미 동작이 검증된
> `ContributionReportController`와 정확히 같은 형태로 Task 1에 반영돼 있음(코드 리뷰로
> 확인 가능, 자동화 테스트만 없음).

(아래는 원래 계획했던 내용 — 위 사유로 실행하지 않음, 기록용으로 남겨둠)

**Files:**
- Test: `App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreSecurityTest.java`

**Interfaces:**
- Consumes: `ContributionScoreController`(Task 1), 기존 `com.workflowai.security.ProjectAccess`,
  기존 `AccessDeniedResponseAdvice`(`src/test/java/com/workflowai/contribution/AccessDeniedResponseAdvice.java` —
  이미 존재, 재사용만 함, 수정/재생성 금지)

- [ ] **Step 1: 보안 테스트 작성**

`App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreSecurityTest.java`:

```java
package com.workflowai.contribution;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflowai.rag.RagRateLimiter;
import com.workflowai.security.ProjectAccess;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ContributionScoreController.class)
@AutoConfigureMockMvc(addFilters = false)
class ContributionScoreSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private FastApiContributionScoreClient fastApiContributionScoreClient;

    @MockBean
    private RagRateLimiter rateLimiter;

    @MockBean(name = "projectAccess")
    private ProjectAccess projectAccess;

    @Test
    void getScoreReturns403WhenProjectAccessRejectsNonReviewer() throws Exception {
        when(projectAccess.hasRole(eq(1L), eq("REVIEWER"))).thenReturn(false);

        String body = objectMapper.writeValueAsString(new ContributionScoreRequest(1L));

        mockMvc.perform(
                post("/api/v1/ai/contribution/score")
                    .with(user("member"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(body)
            )
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
    }

    @TestConfiguration
    @EnableMethodSecurity
    static class MethodSecurityTestConfig {

        @Bean
        AccessDeniedResponseAdvice accessDeniedResponseAdvice() {
            return new AccessDeniedResponseAdvice();
        }
    }
}
```

(`AccessDeniedResponseAdvice`는 같은 패키지의 `ContributionReportSecurityTest.java` 옆에 이미
존재하는 클래스를 그대로 참조한다 — import 불필요, 같은 패키지. 새로 만들지 않는다.)

- [ ] **Step 2: 테스트 실행 → 통과 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.ContributionScoreSecurityTest"`
Expected: `1 test completed, 0 failed`

- [ ] **Step 3: 패키지 전체 회귀 확인**

Run: `cd App/backend_spring && ./gradlew test --tests "com.workflowai.contribution.*"`
Expected: 기존 4개(`ContributionReportControllerTest` 3 + `ContributionReportSecurityTest` 1) +
신규 4개(`ContributionScoreControllerTest` 3 + `ContributionScoreSecurityTest` 1) = 8개 전부 통과,
실패 0건

- [ ] **Step 4: 커밋**

```bash
git add App/backend_spring/src/test/java/com/workflowai/contribution/ContributionScoreSecurityTest.java
git commit -m "test: 기여도 점수 엔드포인트 REVIEWER 권한 검증 테스트 추가"
```

---

## Self-Review 결과 (계획 작성자 자체 점검)

- **스펙 커버리지**: 스펙의 3가지 실질적 차이(쿼리 파라미터, assignee_id, envelope 언래핑)
  전부 Task 1의 Global Constraints와 코드에 명시적으로 반영됨. 응답 형태 결정(전체 객체 감싸기)도
  `ContributionScoreResponseDto`에 `note`/`schema_version` 포함으로 반영됨.
- **플레이스홀더**: 없음 — 모든 코드 블록이 실행 가능한 완전한 코드.
- **타입/시그니처 일관성**: `FastApiContributionScoreClient.fetch(Long projectId) ->
  ContributionScoreResponseDto`(Task 1 정의) — 컨트롤러가 동일 시그니처로 호출. Task 2는 Task 1의
  `ContributionScoreController`/`ContributionScoreRequest`/`FastApiContributionScoreClient`를
  그대로 재사용(재정의 없음).
- **기존 코드와의 일관성**: `ContributionReportController`/`ContributionReportControllerTest`/
  `ContributionReportSecurityTest`의 구조·네이밍·테스트 케이스 구성을 그대로 미러링했고, 다른
  점(쿼리 파라미터·assignee_id·envelope)만 의도적으로 달라짐을 각 파일에 주석/Global
  Constraints로 명시함.
