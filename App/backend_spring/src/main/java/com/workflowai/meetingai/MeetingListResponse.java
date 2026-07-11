package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "회의록 목록 조회 응답")
public record MeetingListResponse(
    @Schema(description = "프로젝트 ID", example = "1") Long projectId,
    @Schema(description = "회의록 목록") List<MeetingSummaryResponse> meetings
) {}
