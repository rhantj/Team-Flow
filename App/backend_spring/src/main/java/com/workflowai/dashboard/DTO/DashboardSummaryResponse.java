package com.workflowai.dashboard.DTO;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "메인 대시보드 요약")
public record DashboardSummaryResponse(
    @Schema(description = "전체 업무 수", example = "14") long totalTasks,
    @Schema(description = "완료 업무 수", example = "4") long doneTasks,
    @Schema(description = "완료율 (%)", example = "29") long progressPercent,
    @Schema(description = "블로커 업무 수", example = "2") long blockedTasks,
    @Schema(description = "진행 중 업무 수", example = "4") long inProgressTasks,
    @Schema(description = "마감 임박 업무 (최대 5건)") List<UpcomingTaskDto> upcomingDeadlines,
    @Schema(description = "팀원별 업무량") List<WorkloadEntryDto> workload,
    @Schema(description = "최근 활동 (최대 10건)") List<ActivityItemDto> recentActivity
) {
}
