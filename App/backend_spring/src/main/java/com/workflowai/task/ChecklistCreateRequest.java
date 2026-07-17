package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "체크리스트 항목 생성 요청")
public record ChecklistCreateRequest(
    @Schema(description = "내용", example = "설계 문서 확인") String title
) {}
