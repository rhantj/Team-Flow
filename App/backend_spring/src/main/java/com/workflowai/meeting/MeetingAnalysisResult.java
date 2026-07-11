package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

@Schema(description = "AI 회의록 분석 결과 본문")
public record MeetingAnalysisResult(
    @Schema(description = "AI 회의 요약", example = "이번 회의에서는 발표자료 작성, 백엔드 API 연결, 테스트 일정이 논의되었습니다.") String summary,
    @Schema(description = "핵심 결정사항 목록") List<String> decisions,
    @Schema(description = "AI가 생성한 To-Do 후보 목록") List<MeetingTodo> todos,
    @Schema(description = "위험 요소 목록") List<String> risks,
    @Schema(description = "핵심 키워드 목록", example = "[\"발표자료\", \"API 연동\", \"테스트\"]") List<String> keywords,
    @Schema(description = "회의 메타 정보 (제목/날짜/참석자)") MeetingMeta meeting_meta
) {}
