package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 AI가 생성한 To-Do 후보")
public record MeetingTodo(
    @Schema(description = "업무 제목", example = "발표자료 초안 작성") String title,
    @Schema(description = "업무 설명", example = "회의에서 논의된 발표자료 목차를 기반으로 초안을 작성한다.") String description,
    @Schema(description = "AI가 추정한 담당자 후보 이름", example = "김민준") String assignee_candidate,
    @Schema(description = "담당자 ID (배정된 경우)", example = "1") String assignee_id,
    @Schema(description = "마감일 (YYYY-MM-DD)", example = "2026-07-15") String due_date,
    @Schema(description = "우선순위", example = "HIGH", allowableValues = {"HIGH", "MEDIUM", "LOW"}) String priority,
    @Schema(description = "카테고리", example = "PRESENTATION") String category,
    @Schema(description = "팀장 검토가 필요한지 여부 (담당자 미배정 등)", example = "false") boolean needs_leader_review
) {}
