package com.workflowai.task;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "작업 내용 첨부파일 (다운로드 URL은 /files/{id}/url에서 별도 발급)")
public record TaskResultFileDto(
    @Schema(description = "파일 ID", example = "5") String id,
    @Schema(description = "파일명") String fileName,
    @Schema(description = "크기(byte)") long size,
    @Schema(description = "MIME 타입") String contentType
) {
    public static TaskResultFileDto from(TaskResultFile file) {
        return new TaskResultFileDto(String.valueOf(file.getId()), file.getFileName(), file.getSize(), file.getContentType());
    }
}
