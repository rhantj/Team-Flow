package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "프로젝트 멤버 정보")
public record MemberResponse(Long userId, String name, String email, String role) {
}
