package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "회의록 AI 분석 응답")
public record MeetingAnalysisResponse(
    @Schema(description = "회의록 ID", example = "demo-project-1") String meetingId,
    @Schema(description = "프로젝트 ID", example = "demo-project") String projectId,
    @Schema(description = "분석 상태", example = "PROCESSING", allowableValues = {"PROCESSING", "COMPLETED", "FAILED"}) String status,
    @Schema(description = "업로드 파일 유형", example = "document", allowableValues = {"document", "audio"}) String sourceType,
    @Schema(description = "업로드된 원본 파일명", example = "7차_정기회의.pdf") String fileName,
    @Schema(description = "분석을 수행한 엔진", example = "FASTAPI", allowableValues = {"FASTAPI", "SPRING_FALLBACK"}) String analysisSource,
    @Schema(description = "AI 분석 결과 (processing/failed일 때는 null)") MeetingAnalysisResult analysis,
    @Schema(description = "실패 사유 (failed일 때만)", example = "회의록 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.") String errorMessage,
    @Schema(description = "참석자 요약 목록") List<AttendeeSummary> attendees
) {}
