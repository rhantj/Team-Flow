# FS-09 기여도 점수 — Spring 연동 설계

작성일: 2026-07-20
작성자: 이은주 (FS-5, FS-09 이어받아 진행)
관련: `document_이은주/superpowers/specs/2026-07-20-contribution-score-design.md` (FastAPI 계산 모델)

## 배경 / 목적

FastAPI `/ai/score/contribution`(workload/task/meeting 3피처 가중 평균 점수)은 완성됐지만
Spring/프론트 어디에도 연동되어 있지 않다. 반면 같은 FS-09 소관인 LLM 서술형 요약
(`ai_contribution_report`)은 이미 Spring `ContributionReportController` →
`FastApiContributionClient` → `/ai/report/contribution`까지 완전히 연동되어 있다. 이번
작업은 그 패턴을 그대로 미러링해서 숫자 점수도 Spring에서 호출 가능하게 만든다
(프론트 연동은 스코프 밖 — 다음 작업).

## 접근법

기존 `ContributionReportController`/`FastApiContributionClient` 패턴을 거의 그대로
복제한다. 같은 패키지(`com.workflowai.contribution`)에 형제 클래스로 추가한다.

**두 가지 실질적 차이점**을 정확히 반영해야 한다:
1. `/ai/score/contribution`은 요청을 **쿼리 파라미터**(`?project_id=`)로 받는다 — LLM
   리포트 쪽(`/ai/report/contribution`)은 JSON body. FastAPI `contribution_router.py`의
   `async def score_contribution(project_id: int)` 시그니처가 body 없는 plain 파라미터라
   FastAPI가 자동으로 쿼리 파라미터로 해석하기 때문. `RestClient`에서
   `.uri("/ai/score/contribution?project_id={id}", projectId)`로 호출해야 한다(body 없음).
2. 팀원 식별자 필드명이 다르다 — LLM 쪽은 `user_id`(Long), 이쪽은 `assignee_id`(String).
   `WorkloadMemberResult.assignee_id`가 애초에 String이라(문자열화된 유저 id) 그대로
   이어진다.

## 응답 형태 결정

`ApiResponse<List<...>>`(멤버 리스트만)이 아니라 **FastAPI 원본 형태를 그대로 보존**한
`ApiResponse<ContributionScoreResponseDto>`(`schema_version`/`project_id`/`members`/`note`
전부 포함)로 감싼다. `note`(빈 프로젝트 사유 등)가 프론트에 유용한 정보라 버리지 않는다.

## 아키텍처

```
ContributionScoreController.getScore(ContributionScoreRequest)
  └─ RagRateLimiter.tryAcquire(project_id)          # 기존 빈 재사용
  └─ FastApiContributionScoreClient.fetch(projectId) # 신규
       └─ GET 아님 POST /ai/score/contribution?project_id={id} (body 없음)
```

### 새 파일 (`App/backend_spring/src/main/java/com/workflowai/contribution/`)

```java
// ContributionScoreRequest.java
package com.workflowai.contribution;

public record ContributionScoreRequest(Long project_id) {}
```

```java
// ContributionMemberScoreDto.java
package com.workflowai.contribution;

public record ContributionMemberScoreDto(
    String assignee_id,
    Double workload_component,
    Double task_component,
    Double meeting_component,
    Double contribution_score
) {}
```

```java
// ContributionScoreResponseDto.java
package com.workflowai.contribution;

import java.util.List;

public record ContributionScoreResponseDto(
    String schema_version,
    Long project_id,
    List<ContributionMemberScoreDto> members,
    String note
) {}
```

**중요한 차이점 3 (실측 확인함)**: `FastApiRagClient`/`FastApiContributionClient`가 호출하는
FastAPI 엔드포인트(`response_model=RagQueryResponse`, `response_model=list[MemberContribution]`)는
envelope 없이 데이터 자체를 반환한다. 반면 우리 `contribution_router.py`는
`response_model=ContributionScoreResponse`로, `{"success": bool, "data": {...}, "error": {...}}`
envelope을 그대로 씌운다(`workload_router.py`와 동일 패턴). 그래서 이 클라이언트만 envelope을
한 겹 벗겨내야 한다 — 형제 클라이언트를 그대로 베끼면 역직렬화가 깨진다.

```java
// ContributionScoreEnvelope.java
package com.workflowai.contribution;

public record ContributionScoreEnvelope(boolean success, ContributionScoreResponseDto data) {}
```

```java
// FastApiContributionScoreClient.java
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
    // LLM 요약이 아니라 순수 계산이라 FastApiContributionClient(60초)보다 짧게 —
    // FastApiRagClient(질의 응답)와 동일하게 30초로 맞춘다.
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

```java
// ContributionScoreController.java
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

주의: `ContributionScoreController`는 **`ContributionReportController`와 같은
`@RequestMapping("/api/v1/ai/contribution")`를 공유**하고 `@PostMapping`이 `/report` vs
`/score`로 나뉘므로 최종 경로는 각각 `/api/v1/ai/contribution/report`,
`/api/v1/ai/contribution/score`로 겹치지 않는다.

## 테스트

기존 `ContributionReportControllerTest`/`ContributionReportSecurityTest` 패턴을 그대로
복제한다:
- `ContributionScoreControllerTest`: standalone MockMvc, `@Mock FastApiContributionScoreClient`,
  성공(200)/FastAPI 실패(503, `CONTRIBUTION_SCORE_UNAVAILABLE`)/rate limit(429) 3케이스.
- `ContributionScoreSecurityTest`: `@WebMvcTest(ContributionScoreController.class)`,
  `REVIEWER`가 아니면 403(`FORBIDDEN`) — 기존 `AccessDeniedResponseAdvice`
  (`src/test/.../contribution/AccessDeniedResponseAdvice.java`)를 그대로 재사용(중복 생성 금지).

## 스코프 밖

- 프론트 `ContributorsView.tsx` 연동 (score/categories 실데이터 교체) — 다음 작업
- `contribution_reports.evidence` 스냅샷 저장 (LLM 리포트 쪽도 아직 안 함 — 별도 논의 필요)
