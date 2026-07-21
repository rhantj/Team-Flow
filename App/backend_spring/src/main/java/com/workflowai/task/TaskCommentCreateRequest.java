package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "업무 코멘트 작성 요청")
public record TaskCommentCreateRequest(
    @Schema(description = "작성자 mock id (\"1\"~\"4\"). 실제 인증 붙기 전까지의 임시 식별자", example = "1") String authorId,
    @Schema(description = "내용") String content,
    @Schema(description = "구분. \"FEEDBACK\"이면 팀장만 작성 가능. 생략 시 \"COMMENT\"", example = "COMMENT") String type
) {}
