package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "체크리스트 항목 수정 요청 (부분 수정 - null 필드는 변경하지 않음)")
public record ChecklistUpdateRequest(
    @Schema(description = "내용") String title,
    @Schema(description = "완료 여부") Boolean done
) {}
