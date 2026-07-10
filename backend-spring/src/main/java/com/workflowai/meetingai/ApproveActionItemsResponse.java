package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "To-Do 후보 승인 처리 응답")
public record ApproveActionItemsResponse(
    @Schema(description = "업무 보드에 등록된 Task ID 목록", example = "[\"TASK-1001\", \"TASK-1002\"]") List<String> createdTaskIds
) {}
