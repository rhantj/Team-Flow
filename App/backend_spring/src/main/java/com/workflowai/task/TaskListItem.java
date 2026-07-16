package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 목록 항목")
public record TaskListItem(
    @Schema(description = "업무 ID", example = "42") String id,
    @Schema(description = "업무 제목", example = "발표자료 초안 작성") String title,
    @Schema(description = "카테고리", example = "PRESENTATION") String category,
    @Schema(description = "상태", example = "todo", allowableValues = {"todo", "inprogress", "blocked", "done"}) String status,
    @Schema(description = "담당자 ID (미배정이면 null)", example = "1") String assigneeId,
    @Schema(description = "마감일 (YYYY-MM-DD)", example = "2026-07-15") String dueDate,
    @Schema(description = "우선순위", example = "HIGH") String priority,
    @Schema(description = "같은 status 안에서의 칸반 카드 순서(오름차순)", example = "0.0") double position
) {
    public static TaskListItem from(Task task) {
        return new TaskListItem(
            String.valueOf(task.getId()),
            task.getTitle(),
            task.getCategory(),
            task.getStatus(),
            task.getAssigneeId() == null ? null : String.valueOf(task.getAssigneeId()),
            task.getDueDate() == null ? null : task.getDueDate().toString(),
            task.getPriority(),
            task.getPosition()
        );
    }
}
