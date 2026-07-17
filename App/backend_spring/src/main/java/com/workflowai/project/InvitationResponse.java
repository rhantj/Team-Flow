package com.workflowai.project;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

@Schema(description = "초대 생성/조회 응답")
public record InvitationResponse(
    Long projectId,
    String email,
    String role,
    String token,
    String status,
    LocalDateTime expiresAt
) {
}
