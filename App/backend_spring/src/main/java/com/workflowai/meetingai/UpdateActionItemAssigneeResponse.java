package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "To-Do 후보 담당자/마감일 수정 응답")
public record UpdateActionItemAssigneeResponse(
    @Schema(description = "수정된 액션 아이템 정보") ActionItemResponse actionItemInfo
) {}
