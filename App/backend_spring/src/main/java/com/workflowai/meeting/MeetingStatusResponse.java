package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 분석 상태 응답")
public record MeetingStatusResponse(
    @Schema(description = "회의록 ID", example = "1") String meetingId,
    @Schema(description = "분석 상태", example = "PROCESSING", allowableValues = {"PROCESSING", "COMPLETED", "FAILED"}) String status,
    @Schema(description = "실패 사유 (failed일 때만)", example = "회의록 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") String errorMessage
) {}
