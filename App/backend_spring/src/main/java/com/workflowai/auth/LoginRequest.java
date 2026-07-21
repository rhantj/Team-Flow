package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
    @NotBlank(message = "이메일을 입력해주세요.")
    @Email(message = "올바른 이메일 형식으로 입력해주세요.")
    @Size(max = 255, message = "이메일은 255자 이하로 입력해주세요.")
    @Schema(description = "이메일", example = "user@example.com")
    String email,

    @NotBlank(message = "비밀번호를 입력해주세요.")
    @Size(max = 128, message = "비밀번호는 128자 이하로 입력해주세요.")
    @Schema(description = "비밀번호", example = "12345678")
    String password
) {
}
