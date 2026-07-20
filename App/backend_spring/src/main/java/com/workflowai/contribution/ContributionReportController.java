package com.workflowai.contribution;

import com.workflowai.common.ApiResponse;
import com.workflowai.rag.RagRateLimiter;
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

@Tag(name = "AI 기여도 리포트", description = "심사자 전용 팀원별 기여도 요약 API")
@RestController
@RequestMapping("/api/v1/ai/contribution")
public class ContributionReportController {
    private final FastApiContributionClient fastApiContributionClient;
    private final RagRateLimiter rateLimiter;

    public ContributionReportController(FastApiContributionClient fastApiContributionClient, RagRateLimiter rateLimiter) {
        this.fastApiContributionClient = fastApiContributionClient;
        this.rateLimiter = rateLimiter;
    }

    @Operation(
        summary = "기여도 리포트 생성",
        description = "업무/회의 활동을 집계해 팀원별 AI 기여도 요약을 생성하고 저장합니다. 심사자만 호출 가능합니다."
    )
    @PostMapping("/report")
    @PreAuthorize("@projectAccess.hasRole(#request.project_id(), 'REVIEWER')")
    public ResponseEntity<ApiResponse<List<MemberContributionDto>>> generateReport(
        @RequestBody ContributionReportRequest request
    ) {
        if (!rateLimiter.tryAcquire(request.project_id())) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(ApiResponse.fail("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요."));
        }

        try {
            List<MemberContributionDto> response = fastApiContributionClient.generate(request);
            return ResponseEntity.ok(ApiResponse.ok(response));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(ApiResponse.fail("CONTRIBUTION_REPORT_UNAVAILABLE", "기여도 리포트를 생성하지 못했습니다."));
        }
    }
}
