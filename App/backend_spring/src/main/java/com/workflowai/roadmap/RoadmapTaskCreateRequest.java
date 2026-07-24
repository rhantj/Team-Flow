package com.workflowai.roadmap;

import io.swagger.v3.oas.annotations.media.Schema;

public record RoadmapTaskCreateRequest(
    @Schema(description = "업무 제목", example = "API 연동 테스트") String title,
    @Schema(description = "담당자 ID") String assigneeId,
    @Schema(description = "카테고리", example = "backend") String category,
    @Schema(description = "우선순위", example = "medium") String priority,
    @Schema(description = "시작일. 생략하면 마일스톤 기간에서 기본값 계산") String startDate,
    @Schema(description = "마감일. 생략하면 마일스톤 마감일 사용") String dueDate
) {
}
