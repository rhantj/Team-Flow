package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 목록 항목")
public record MeetingSummaryResponse(
    @Schema(description = "회의록 ID", example = "1") Long meetingId,
    @Schema(description = "회의 제목", example = "7차 정기회의") String title,
    @Schema(description = "회의 날짜", example = "2026-07-09") String meetingDate,
    @Schema(description = "회의 유형", example = "정기회의") String meetingKind,
    @Schema(description = "분석 상태", example = "ANALYZED", allowableValues = {"PENDING", "ANALYZING", "ANALYZED"}) String status
) {}
