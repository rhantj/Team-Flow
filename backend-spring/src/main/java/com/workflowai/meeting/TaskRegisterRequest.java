package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "회의록 To-Do 업무 등록 요청")
public record TaskRegisterRequest(
    @Schema(description = "팀장이 승인한 To-Do 후보 목록 (담당자/마감일이 확정된 상태)") List<MeetingTodo> todos
) {}
