package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "To-Do 후보 승인 요청")
public record ApproveActionItemsRequest(
    @Schema(description = "승인할 액션 아이템 ID 목록", example = "[\"AI-TODO-001\", \"AI-TODO-002\"]") List<String> actionItemIds,
    @Schema(description = "담당자/마감일 재지정 목록 (선택)") List<ActionItemOverrideRequest> overrides
) {}
