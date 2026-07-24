package com.workflowai.rag;

import com.workflowai.common.ApiResponse;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "AI RAG 어시스턴트", description = "프로젝트 데이터 기반 RAG 질의응답 API")
@RestController
@RequestMapping("/api/v1/ai/rag")
public class RagController {
    // 재작성 프롬프트에 실을 대화 기록의 상한. 무한정 받으면 FastAPI 재작성 LLM 호출이 비대해지고
    // 악의적 대용량 페이로드의 통로가 된다.
    private static final int MAX_HISTORY_MESSAGES = 6;
    private static final int MAX_HISTORY_CONTENT_LENGTH = 1000;

    private final FastApiRagClient fastApiRagClient;
    private final RagRateLimiter rateLimiter;

    public RagController(FastApiRagClient fastApiRagClient, RagRateLimiter rateLimiter) {
        this.fastApiRagClient = fastApiRagClient;
        this.rateLimiter = rateLimiter;
    }

    @Operation(
        summary = "RAG 질의응답",
        description = "회의록/업무 데이터를 기반으로 한 AI 답변과 출처를 반환합니다. "
            + "프로젝트 단위로 요청 빈도가 제한됩니다."
    )
    @PostMapping("/query")
    @PreAuthorize("@projectAccess.isMember(#request.project_id())")
    public ResponseEntity<ApiResponse<RagQueryResponse>> query(@RequestBody RagQueryRequest request) {
        if (!rateLimiter.tryAcquire(request.project_id())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요."));
        }

        // null은 히스토리 없음으로 정규화한다. FastAPI history 필드는 리스트를 기대한다.
        List<RagHistoryMessage> history = request.history() == null ? List.of() : request.history();
        if (history.size() > MAX_HISTORY_MESSAGES
            || history.stream().anyMatch(RagController::exceedsContentLimit)) {
            return ResponseEntity.badRequest()
                .body(ApiResponse.fail("INVALID_HISTORY", "대화 기록이 허용 범위를 초과했습니다."));
        }

        try {
            // user_id는 요청 바디를 신뢰하지 않고 인증 세션에서 직접 채운다 (본인 아닌 다른 사람의
            // user_id를 흉내내 담당 업무를 조회하는 것을 방지).
            RagQueryRequest authenticatedRequest = new RagQueryRequest(
                request.project_id(), request.question(), CurrentUser.id(), history
            );
            RagQueryResponse response = fastApiRagClient.query(authenticatedRequest);
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("RAG_UNAVAILABLE", "일시적으로 답변을 생성할 수 없습니다."));
        }
    }

    private static boolean exceedsContentLimit(RagHistoryMessage message) {
        return message.content() != null && message.content().length() > MAX_HISTORY_CONTENT_LENGTH;
    }
}
