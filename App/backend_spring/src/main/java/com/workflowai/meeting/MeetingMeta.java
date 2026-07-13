package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "회의 메타 정보")
public record MeetingMeta(
    @Schema(description = "회의 제목", example = "7차 정기회의") String title,
    @Schema(description = "회의 날짜", example = "2026-07-09") String meeting_date,
    @Schema(description = "참석자 이름 목록", example = "[\"김민준\", \"이서연\"]") List<String> participants
) {}
