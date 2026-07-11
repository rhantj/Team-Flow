package com.workflowai.meetingai;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 AI가 생성한 To-Do 후보")
public record ActionItemResponse(
    @Schema(description = "액션 아이템 ID", example = "AI-TODO-001") String actionItemId,
    @Schema(description = "업무 제목", example = "발표자료 초안 작성") String title,
    @Schema(description = "업무 설명", example = "회의에서 논의된 발표자료 목차를 기반으로 초안을 작성한다.") String description,
    @Schema(description = "카테고리", example = "presentation") String category,
    @Schema(description = "담당자 후보 ID", example = "1") Long assigneeId,
    @Schema(description = "담당자 후보 이름", example = "김민준") String assigneeName,
    @Schema(description = "마감일", example = "2026-07-15") String dueDate,
    @Schema(description = "우선순위", example = "HIGH", allowableValues = {"HIGH", "MEDIUM", "LOW"}) String priority,
    @Schema(description = "승인 상태", example = "PENDING_APPROVAL", allowableValues = {"PENDING_APPROVAL", "APPROVED", "REJECTED"}) String status,
    @Schema(description = "생성 출처", example = "MEETING_AI") String source,
    @Schema(description = "연결된 회의록 ID", example = "1") Long meetingId
) {}
