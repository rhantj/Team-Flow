package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "팀원/심사자 초대 생성 요청")
public record CreateInvitationRequest(@NotBlank @Email String email, @NotBlank String role) {
}
