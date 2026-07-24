package com.workflowai.reviewer;

import com.workflowai.common.ApiResponse;
import com.workflowai.security.CurrentUser;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "심사자", description = "심사자 마이페이지 전용 API")
@RestController
@RequestMapping("/api/v1/me/reviewer-projects")
public class ReviewerController {
    private final ReviewerService reviewerService;

    public ReviewerController(ReviewerService reviewerService) {
        this.reviewerService = reviewerService;
    }

    @Operation(
        summary = "내가 심사자로 배정된 프로젝트 목록",
        description = "현재 로그인한 사용자가 REVIEWER 역할로 배정된 모든 프로젝트를 반환한다. 심사자가 아니면 빈 배열을 반환한다."
    )
    @GetMapping
    public ApiResponse<List<ReviewerProjectSummary>> myReviewProjects() {
        return ApiResponse.ok(reviewerService.getMyReviewProjects(CurrentUser.id()));
    }
}
