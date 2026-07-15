package com.workflowai.auth;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "JWT 발급 응답")
public record AuthTokenResponse(String accessToken, String refreshToken, long expiresIn, UserSummary user) {
}
