package com.workflowai.meeting;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "회의록 참석자 요약")
public record AttendeeSummary(
    @Schema(description = "사용자 ID", example = "1") Long id,
    @Schema(description = "이름", example = "김민준") String name,
    @Schema(description = "프로젝트 내 역할", example = "팀장") String role
) {}
