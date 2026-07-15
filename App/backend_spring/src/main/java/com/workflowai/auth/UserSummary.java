package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "사용자 기본 정보")
public record UserSummary(Long id, String email, String name) {
}
