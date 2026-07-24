package com.workflowai.assistant;

import com.workflowai.common.ApiResponse;
import com.workflowai.project.ProjectMemberRepository;
import com.workflowai.rag.RagRateLimiter;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;

@Tag(name = "AI 어시스턴트", description = "질의응답 및 업무 조작 명령 API")
@RestController
@RequestMapping("/api/v1/ai/assistant")
public class AssistantController {
    private static final Logger log = LoggerFactory.getLogger(AssistantController.class);

    private static final int MAX_HISTORY_MESSAGES = 6;
    private static final int MAX_HISTORY_CONTENT_LENGTH = 1000;

    private final FastApiAssistantClient fastApiAssistantClient;
    private final RagRateLimiter rateLimiter;
    private final ProjectMemberRepository projectMemberRepository;
    private final AssistantThreadOwnership threadOwnership;

    public AssistantController(
        FastApiAssistantClient fastApiAssistantClient,
        RagRateLimiter rateLimiter,
        ProjectMemberRepository projectMemberRepository,
        AssistantThreadOwnership threadOwnership
    ) {
        this.fastApiAssistantClient = fastApiAssistantClient;
        this.rateLimiter = rateLimiter;
        this.projectMemberRepository = projectMemberRepository;
        this.threadOwnership = threadOwnership;
    }

    @Operation(
        summary = "어시스턴트 발화 처리",
        description = "질문이면 RAG 답변을, 업무 조작 명령이면 확인 카드를 반환합니다."
    )
    @PostMapping("/command")
    @PreAuthorize("@projectAccess.isMember(#request.project_id())")
    public ResponseEntity<ApiResponse<AssistantResponse>> command(
        @RequestBody AssistantCommandRequest request
    ) {
        // 입력 검증은 rate limit 차감보다 먼저 한다. 그렇지 않으면 잘못된 페이로드(빈 질문·
        // 비정상 history)만으로 프로젝트 요청 예산을 소진시킬 수 있다.
        //
        // 빈/공백/null 질문은 클라이언트 잘못이다. FastAPI로 넘기면 무의미한 LLM 호출을 태우거나,
        // null이면 FastAPI가 422로 거부해 RestClientException → 503("일시 장애")으로 위장된다.
        if (request.question() == null || request.question().isBlank()) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_QUESTION", "질문을 입력해주세요."));
        }

        List<AssistantHistoryMessage> history =
            request.history() == null ? List.of() : request.history();
        if (history.size() > MAX_HISTORY_MESSAGES
            || history.stream().anyMatch(AssistantController::isInvalid)) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_HISTORY", "대화 기록이 허용 범위를 초과했습니다."));
        }

        if (!rateLimiter.tryAcquire(request.project_id())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요."));
        }

        // 역할은 요청 바디를 신뢰하지 않고 인증 세션 + DB 멤버십에서 직접 조회한다.
        // (팀장 전용 도구를 멤버가 참칭하는 것을 막는 1차 방어. 최종 방어선은 각 API의 @PreAuthorize다.)
        Long userId = CurrentUser.id();
        String role = projectMemberRepository.findByProjectIdAndUserId(request.project_id(), userId)
            .map(member -> member.getRole().name())
            .orElse(null);
        if (role == null) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.fail("NOT_PROJECT_MEMBER", "프로젝트 멤버가 아닙니다."));
        }

        try {
            FastApiAssistantRequest upstream = new FastApiAssistantRequest(
                request.project_id(), request.question(), userId, role, history
            );
            AssistantResponse response = fastApiAssistantClient.command(upstream);
            // confirm 응답이면 이 스레드를 이 사용자 것으로 기록한다. resume 때 소유권 대조에 쓴다.
            if (response.thread_id() != null) {
                threadOwnership.remember(response.thread_id(), userId);
            }
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (RestClientException ex) {
            // 다운스트림 장애만 503으로 눌러 담는다. 우리 쪽 버그는 GlobalExceptionHandler로 흘려
            // 500으로 드러내, "일시 장애"와 "코드 결함"이 뭉개지지 않게 한다.
            log.warn("어시스턴트 명령 처리 실패: project_id={}", request.project_id(), ex);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("ASSISTANT_UNAVAILABLE", "일시적으로 처리할 수 없습니다."));
        }
    }

    @Operation(summary = "확인 카드 실행 결과 전달", description = "프론트가 실제 API를 호출한 결과를 그래프에 돌려줍니다.")
    @PostMapping("/resume")
    @PreAuthorize("@projectAccess.isMember(#request.project_id())")
    public ResponseEntity<ApiResponse<AssistantResponse>> resume(
        @RequestBody AssistantResumeRequest request
    ) {
        Long userId = CurrentUser.id();
        // threadId만 알면 남의 그래프를 재개할 수 있으면 안 된다.
        if (request.thread_id() == null || !threadOwnership.isOwnedBy(request.thread_id(), userId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.fail("THREAD_NOT_OWNED", "만료되었거나 접근할 수 없는 요청입니다."));
        }
        try {
            FastApiAssistantResumeRequest upstream = new FastApiAssistantResumeRequest(
                request.thread_id(),
                request.step_id(),
                Boolean.TRUE.equals(request.ok()),
                request.error()
            );
            return ResponseEntity.ok(ApiResponse.ok(fastApiAssistantClient.resume(upstream)));
        } catch (RestClientException ex) {
            log.warn("어시스턴트 재개 실패: thread_id={}", request.thread_id(), ex);
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("ASSISTANT_UNAVAILABLE", "일시적으로 처리할 수 없습니다."));
        }
    }

    // JSON 배열에 null 원소("history":[null])가 오면 필드 역참조가 NPE(500)로 이어진다.
    // FastAPI 스키마(role: Literal["user","assistant"], content: str)와 같은 기준으로 먼저 거부한다.
    private static boolean isInvalid(AssistantHistoryMessage message) {
        return message == null
            || message.content() == null
            || message.content().length() > MAX_HISTORY_CONTENT_LENGTH
            || !("user".equals(message.role()) || "assistant".equals(message.role()));
    }
}
