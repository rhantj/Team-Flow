package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "To-Do 후보 승인 시 담당자/마감일 재지정 값")
public record ActionItemOverrideRequest(
    @Schema(description = "재지정할 액션 아이템 ID", example = "AI-TODO-001") String actionItemId,
    @Schema(description = "재지정할 담당자 ID", example = "2") Long assigneeId,
    @Schema(description = "재지정할 마감일", example = "2026-07-18") String dueDate
) {}
