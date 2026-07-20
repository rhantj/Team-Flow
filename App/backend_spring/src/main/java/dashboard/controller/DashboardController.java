package dashboard.controller;

import com.workflowai.common.ApiResponse;
import dashboard.DTO.DashboardSummaryResponse;
import dashboard.DTO.ProgressDetailResponse;
import dashboard.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "대시보드", description = "메인 대시보드 / 전체 진행률 조회 API")
@RestController
@RequestMapping("/api/v1/projects/{projectId}/dashboard")
public class DashboardController {
    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @Operation(summary = "메인 대시보드 요약", description = "전체 업무 통계, 마감 임박 업무, 팀원별 업무량, 최근 활동을 반환한다.")
    @GetMapping("/summary")
    public ApiResponse<DashboardSummaryResponse> getSummary(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        return ApiResponse.ok(dashboardService.getSummary(projectId));
    }

    @Operation(summary = "전체 진행률 상세", description = "마일스톤/카테고리별 진행률과 AI 지연 위험도(ml_predictions)를 반환한다.")
    @GetMapping("/progress")
    public ApiResponse<ProgressDetailResponse> getProgress(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        return ApiResponse.ok(dashboardService.getProgressDetail(projectId));
    }

    @Operation(
        summary = "AI 지연 위험도 재분석",
        description = "FastAPI(ml_delay_risk)에 재예측을 요청해 ml_predictions을 갱신한 뒤, 최신 진행률 상세를 반환한다. "
            + "FastAPI 호출이 실패해도 기존에 저장된 예측으로 계속 응답한다."
    )
    @PostMapping("/delay-risk/refresh")
    public ApiResponse<ProgressDetailResponse> refreshDelayRisk(
        @Parameter(description = "프로젝트 ID", example = "demo-project") @PathVariable String projectId
    ) {
        return ApiResponse.ok(dashboardService.refreshDelayRiskAndGetProgress(projectId));
    }
}
