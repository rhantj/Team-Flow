package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public record TestLoginRequest(
    @NotBlank @Schema(description = "테스트 계정 아이디", example = "leader") String username,
    @NotBlank @Schema(description = "비밀번호 (테스트 계정은 전부 1111)", example = "1111") String password
) {
}
