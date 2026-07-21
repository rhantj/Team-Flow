package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "작업 내용 저장(생성/수정) 요청")
public record TaskResultSaveRequest(
    @Schema(description = "작업 내용") String content
) {}
