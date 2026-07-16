package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 생성 요청")
public record TaskCreateRequest(
    @Schema(description = "업무 제목", example = "발표자료 초안 작성") String title,
    @Schema(description = "카테고리", example = "presentation") String category,
    @Schema(description = "상태", example = "todo", allowableValues = {"todo", "inprogress", "blocked", "done"}) String status,
    @Schema(description = "담당자 mock id(\"1\"~\"4\"). 실제 인증 붙기 전까지의 임시 식별자", example = "1") String assigneeId,
    @Schema(description = "마감일 (YYYY-MM-DD)", example = "2026-07-20") String dueDate,
    @Schema(description = "우선순위", example = "medium") String priority,
    @Schema(description = "업무 설명") String description
) {}
