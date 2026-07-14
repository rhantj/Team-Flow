package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "To-Do 후보 담당자/마감일 수정 요청")
public record UpdateActionItemAssigneeRequest(
    @Schema(description = "담당자 ID", example = "2") Long assigneeId,
    @Schema(description = "마감일", example = "2026-07-18") String dueDate
) {}
