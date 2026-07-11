package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 업로드 응답")
public record MeetingUploadResponse(
    @Schema(description = "생성된 회의록 ID", example = "1") Long meetingId,
    @Schema(description = "업로드된 파일 저장 경로", example = "/uploads/meetings/1/7cha_regular_meeting.pdf") String filePath
) {}
