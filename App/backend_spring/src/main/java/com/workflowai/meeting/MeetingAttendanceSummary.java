package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "프로젝트 멤버별 회의 참석 요약")
public record MeetingAttendanceSummary(
    @Schema(description = "사용자 ID", example = "1") Long userId,
    @Schema(description = "이름", example = "김민준") String name,
    @Schema(description = "참석한 회의 수", example = "3") int meetingsAttended,
    @Schema(description = "프로젝트 전체 회의 수", example = "4") int totalMeetings,
    @Schema(description = "참석률(%)", example = "75") int attendanceRate
) {}
