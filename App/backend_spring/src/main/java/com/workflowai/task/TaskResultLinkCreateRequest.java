package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "작업 내용 관련 링크 추가 요청")
public record TaskResultLinkCreateRequest(
    @Schema(description = "로그인한 사용자 DB id", example = "3") Long userId,
    @Schema(description = "URL") String url,
    @Schema(description = "제목") String title
) {}
