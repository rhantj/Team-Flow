package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 To-Do 업무 등록 응답")
public record TaskRegisterResponse(
    @Schema(description = "회의록 ID", example = "demo-project-1") String meetingId,
    @Schema(description = "실제로 등록된 업무 개수", example = "3") int registeredCount,
    @Schema(description = "업무보드 반영 상태", example = "REGISTERED", allowableValues = {"REGISTERED", "FAILED"}) String boardStatus
) {}
