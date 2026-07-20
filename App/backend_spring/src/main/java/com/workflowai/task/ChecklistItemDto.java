package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "체크리스트 항목")
public record ChecklistItemDto(
    @Schema(description = "체크리스트 항목 ID", example = "7") String id,
    @Schema(description = "내용", example = "설계 문서 확인") String title,
    @Schema(description = "완료 여부", example = "false") boolean done
) {
    public static ChecklistItemDto from(Checklist checklist) {
        return new ChecklistItemDto(String.valueOf(checklist.getId()), checklist.getTitle(), checklist.isDone());
    }
}
