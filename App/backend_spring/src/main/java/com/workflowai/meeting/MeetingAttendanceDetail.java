package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "팀원의 회의별 참석/결석 상세")
public record MeetingAttendanceDetail(
    @Schema(description = "회의록 ID", example = "12") String meetingId,
    @Schema(description = "회의 제목", example = "12.10 팀 정기 회의") String title,
    @Schema(description = "회의 날짜", example = "2026-12-10") String meetingDate,
    @Schema(description = "참석 여부", example = "true") boolean attended
) {}
