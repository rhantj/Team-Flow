package com.workflowai.roadmap;

import io.swagger.v3.oas.annotations.media.Schema;

public record TaskMilestoneUpdateRequest(
    @Schema(description = "새 마일스톤 ID. null이면 일정 미정으로 연결 해제") Long milestoneId
) {
}
