package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 분석 작업 상태 응답")
public record AnalysisJobResponse(
    @Schema(description = "작업 ID", example = "job-1001") String jobId,
    @Schema(description = "작업 상태", example = "IN_PROGRESS", allowableValues = {"PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"}) String status,
    @Schema(description = "진행률(%)", example = "62") int progress
) {}
