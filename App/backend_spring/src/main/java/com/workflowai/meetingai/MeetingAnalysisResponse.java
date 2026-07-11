package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "회의록 AI 분석 결과 조회 응답")
public record MeetingAnalysisResponse(
    @Schema(description = "회의록 ID", example = "1") Long meetingId,
    @Schema(description = "회의 제목", example = "7차 정기회의") String title,
    @Schema(description = "AI 요약", example = "이번 회의에서는 발표자료 작성, 백엔드 API 연결, 테스트 일정이 논의되었습니다.") String summary,
    @Schema(description = "핵심 결정사항") List<String> decisions,
    @Schema(description = "위험 요소") List<String> risks,
    @Schema(description = "AI 생성 To-Do 후보 목록") List<ActionItemResponse> actionItems
) {}
