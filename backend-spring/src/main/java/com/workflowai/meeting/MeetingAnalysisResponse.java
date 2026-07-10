package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 AI 분석 응답")
public record MeetingAnalysisResponse(
    @Schema(description = "회의록 ID", example = "demo-project-1") String meetingId,
    @Schema(description = "프로젝트 ID", example = "demo-project") String projectId,
    @Schema(description = "분석 상태", example = "ANALYZED") String status,
    @Schema(description = "업로드 파일 유형", example = "document", allowableValues = {"document", "audio", "video"}) String sourceType,
    @Schema(description = "업로드된 원본 파일명", example = "7차_정기회의.pdf") String fileName,
    @Schema(description = "분석을 수행한 엔진", example = "FASTAPI", allowableValues = {"FASTAPI", "SPRING_FALLBACK"}) String analysisSource,
    @Schema(description = "AI 분석 결과") MeetingAnalysisResult analysis
) {}
