package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 코멘트 수정 요청")
public record TaskCommentUpdateRequest(
    @Schema(description = "내용") String content
) {}
