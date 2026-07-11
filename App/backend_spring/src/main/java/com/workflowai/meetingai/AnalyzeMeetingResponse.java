package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 AI 분석 요청 접수 응답")
public record AnalyzeMeetingResponse(
    @Schema(description = "분석 작업 ID", example = "job-1001") String analysisJobId,
    @Schema(description = "작업 상태", example = "IN_PROGRESS", allowableValues = {"PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"}) String status
) {}
