package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 삭제 응답")
public record MeetingDeleteResponse(
    @Schema(description = "삭제된 회의록 ID", example = "42") String meetingId,
    @Schema(description = "삭제 상태", example = "DELETED") String status
) {}
