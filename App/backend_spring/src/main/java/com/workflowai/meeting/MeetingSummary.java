package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 목록 항목")
public record MeetingSummary(
    @Schema(description = "회의록 ID", example = "12") String meetingId,
    @Schema(description = "회의 제목", example = "7차 정기회의") String title,
    @Schema(description = "회의 날짜", example = "2026-07-09") String meetingDate,
    @Schema(description = "회의 유형", example = "정기회의") String meetingType,
    @Schema(description = "분석 상태", example = "completed", allowableValues = {"pending", "processing", "completed", "failed"}) String analysisStatus
) {}
