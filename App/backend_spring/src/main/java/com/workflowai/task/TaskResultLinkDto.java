package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "작업 내용 관련 링크")
public record TaskResultLinkDto(
    @Schema(description = "링크 ID", example = "3") String id,
    @Schema(description = "URL") String url,
    @Schema(description = "제목") String title
) {
    public static TaskResultLinkDto from(TaskResultLink link) {
        return new TaskResultLinkDto(String.valueOf(link.getId()), link.getUrl(), link.getTitle());
    }
}
