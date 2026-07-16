package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

@Schema(description = "프로젝트 멤버 역할 변경 요청")
public record UpdateMemberRoleRequest(@NotBlank String role) {
}
