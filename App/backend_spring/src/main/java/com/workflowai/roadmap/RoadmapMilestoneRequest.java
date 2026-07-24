package com.workflowai.roadmap;

import io.swagger.v3.oas.annotations.media.Schema;

public record RoadmapMilestoneRequest(
    @Schema(description = "마일스톤 이름", example = "통합 테스트") String title,
    @Schema(description = "시작일", example = "2026-07-17") String startDate,
    @Schema(description = "마감일", example = "2026-07-28") String dueDate
) {
}
